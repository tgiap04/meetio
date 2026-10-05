import { ForbiddenException, Logger } from '@nestjs/common';
import { STT_STREAM_MAX_FRAME_BYTES, SttStreamErrorCode, type SttLanguage } from '@meetio/shared';
import type { LiveOpener } from '../ai/gemini-live.js';
import type { UsageTracker } from '../ai/usage-tracker.js';
import { AudioRateLimiter } from './stt-audio-rate-limiter.js';
import { LiveUsageMeter } from './stt-live-usage-meter.js';
import { SttLiveSession, type SttLiveOptions, type SttLiveSink } from './stt-live-session.js';

export interface SttStreamOptions extends SttLiveOptions {
  usageIntervalMs: number;
  maxFrameBytes?: number;
  /** Stream starts one user may make per minute (default 5). */
  maxStartsPerMinute?: number;
  /** Live sessions open at once across all users; 0 / unset = unlimited. */
  maxConcurrent?: number;
}

export interface SttStreamDeps {
  opener: LiveOpener;
  usage: Pick<UsageTracker, 'record' | 'assertWithinBudget'>;
  options: SttStreamOptions;
  userId: string;
  meetingId: string | null;
  language: SttLanguage;
  /** Rejects (ForbiddenException) once the user no longer has current consent; re-run on every usage tick. */
  assertConsent: () => Promise<void>;
  /** When the access token the socket authenticated with expires (epoch ms); the stream ends shortly after. */
  tokenExpiresAtMs?: number;
}

/** Clock skew and in-flight frames: the stream outlives the token by this much. */
const TOKEN_GRACE_MS = 5000;

const asFrame = (data: unknown): Buffer | null => {
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof ArrayBuffer) return Buffer.from(data);
  if (ArrayBuffer.isView(data)) return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  return null;
};

/**
 * One user's live recognition stream: validates and rate-limits the incoming PCM, feeds the Live
 * session, meters usage, and guarantees a single end — whether the client stops, the socket drops,
 * the budget runs out or Gemini cannot be reached. Audio and text are never logged.
 */
export class SttStream {
  private readonly session: SttLiveSession;
  private readonly meter: LiveUsageMeter;
  private readonly limiter = new AudioRateLimiter(5000, 1.5);
  private readonly logger = new Logger(SttStream.name);
  private tokenTimer: NodeJS.Timeout | null = null;
  private ended = false;

  constructor(
    private readonly deps: SttStreamDeps,
    private readonly sink: SttLiveSink,
    private readonly onEnded: () => void,
  ) {
    this.session = new SttLiveSession(
      deps.opener,
      deps.language,
      {
        partial: (text) => !this.ended && sink.partial(text),
        final: (text) => !this.ended && sink.final(text),
        fatal: (code, message) => this.fail(code, message),
      },
      deps.options,
    );
    this.meter = new LiveUsageMeter(
      deps.usage,
      { userId: deps.userId, meetingId: deps.meetingId, model: deps.opener.model },
      deps.options.usageIntervalMs,
      () => this.fail(SttStreamErrorCode.QUOTA_EXCEEDED, 'Đã dùng hết hạn mức AI trong tháng'),
      () => this.recheckConsent(),
    );
  }

  /** Opens the first Live session. On rejection nothing is left running. */
  async start(): Promise<void> {
    try {
      await this.session.start();
    } catch (error) {
      this.finish();
      throw error;
    }
    this.meter.start();
    if (this.deps.tokenExpiresAtMs !== undefined) {
      const wait = Math.max(0, this.deps.tokenExpiresAtMs + TOKEN_GRACE_MS - Date.now());
      this.tokenTimer = setTimeout(() => this.fail(SttStreamErrorCode.TOKEN_EXPIRED, 'Access token đã hết hạn'), wait);
    }
  }

  get isEnded(): boolean {
    return this.ended;
  }

  private async recheckConsent(): Promise<void> {
    try {
      await this.deps.assertConsent();
    } catch (error) {
      if (error instanceof ForbiddenException) this.fail(SttStreamErrorCode.CONSENT_REQUIRED, 'Cần đồng ý với nội dung xử lý dữ liệu hiện hành');
      else this.logger.warn(`Live consent check failed (${error instanceof Error ? error.name : 'Error'})`);
    }
  }

  /** One `stt_audio` frame. A bad frame ends the stream: the client falls back to chunked mode. */
  push(data: unknown): void {
    if (this.ended) return;
    const frame = asFrame(data);
    if (!frame || frame.length === 0 || frame.length % 2 !== 0) {
      this.fail(SttStreamErrorCode.VALIDATION_ERROR, 'Khung âm thanh không hợp lệ');
    } else if (frame.length > (this.deps.options.maxFrameBytes ?? STT_STREAM_MAX_FRAME_BYTES)) {
      this.fail(SttStreamErrorCode.RATE_LIMITED, 'Khung âm thanh quá lớn');
    } else if (!this.limiter.allow(frame.length)) {
      this.fail(SttStreamErrorCode.RATE_LIMITED, 'Âm thanh gửi nhanh hơn thời gian thực');
    } else {
      this.session.push(frame);
    }
  }

  /** Graceful end: the last words are flushed to the sink before this resolves. */
  async stop(): Promise<void> {
    if (this.ended) return;
    await this.session.stop();
    this.finish();
  }

  /** Immediate end without a message to the client (disconnect, replaced). */
  close(): void {
    this.finish();
  }

  /** Ends the stream and tells the client why. */
  fail(code: SttStreamErrorCode, message: string): void {
    if (this.ended) return;
    this.finish();
    this.sink.fatal(code, message);
  }

  private finish(): void {
    if (this.ended) return;
    this.ended = true;
    if (this.tokenTimer) clearTimeout(this.tokenTimer);
    this.session.dispose();
    void this.meter.stop();
    this.onEnded();
  }
}
