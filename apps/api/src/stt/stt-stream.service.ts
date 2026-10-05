import { ForbiddenException, Inject, Injectable, Logger } from '@nestjs/common';
import { STT_LANGUAGES, SttStreamErrorCode, type SttLanguage, type SttStreamStartPayload } from '@meetio/shared';
import { AiServiceUnavailableError, QuotaExceededError } from '../ai/ai-errors.js';
import { GeminiLiveClient } from '../ai/gemini-live.js';
import { UsageTracker } from '../ai/usage-tracker.js';
import { SttService } from './stt.service.js';
import { SttStream, type SttStreamOptions } from './stt-stream.js';
import type { SttLiveSink } from './stt-live-session.js';

export const STT_STREAM_OPTIONS = Symbol('STT_STREAM_OPTIONS');

/** `stt_start` refused; the code goes to the client in the ack. */
export class SttStreamRefusal extends Error {
  constructor(
    readonly code: SttStreamErrorCode,
    message: string,
  ) {
    super(message);
  }
}

const REPLACED_MESSAGE = 'Một luồng nhận diện mới đã thay thế luồng này';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A user's place in the registry from the moment `stt_start` arrives, so a racing second start can supersede it. */
interface Slot {
  stream: SttStream | null;
  supersededBy: string | null;
  replace(): void;
}

/**
 * Policy for `/stt-stream`: one active stream per user — a newer `stt_start` REPLACES the older one
 * (which gets `stt_error STREAM_REPLACED`), because the usual cause is a reconnect whose dead socket
 * the server has not noticed yet. Before a Live session opens: consent, then the monthly budget.
 */
@Injectable()
export class SttStreamService {
  private readonly logger = new Logger(SttStreamService.name);
  private readonly slots = new Map<string, Slot>();
  private readonly startTimes = new Map<string, number[]>();

  constructor(
    private readonly stt: SttService,
    private readonly usage: UsageTracker,
    private readonly live: GeminiLiveClient,
    @Inject(STT_STREAM_OPTIONS) private readonly options: SttStreamOptions,
  ) {}

  async open(userId: string, body: unknown, sink: SttLiveSink, tokenExpiresAtSec?: number): Promise<SttStream> {
    const request = parseStart(body);
    this.assertStartRate(userId);
    // Everything that can refuse runs BEFORE the user's current stream is replaced.
    await this.stt.assertConsent(userId).catch((error: unknown) => {
      if (error instanceof ForbiddenException) throw new SttStreamRefusal(SttStreamErrorCode.CONSENT_REQUIRED, 'Cần đồng ý với nội dung xử lý dữ liệu hiện hành');
      throw refusalFor(error, this.logger);
    });
    if (!this.live.isConfigured()) throw new SttStreamRefusal(SttStreamErrorCode.AI_SERVICE_UNAVAILABLE, 'Chưa cấu hình GEMINI_API_KEY');
    const limit = this.options.maxConcurrent ?? 0;
    if (limit > 0 && !this.slots.has(userId) && this.slots.size >= limit) {
      throw new SttStreamRefusal(SttStreamErrorCode.AI_SERVICE_UNAVAILABLE, 'Máy chủ đang quá tải nhận diện, thử lại sau');
    }
    await this.usage.assertWithinBudget(userId).catch((error: unknown) => {
      throw refusalFor(error, this.logger);
    });
    const meetingId = request.meeting_id ? await this.stt.ownMeetingId(userId, request.meeting_id) : null;
    const slot: Slot = {
      stream: null,
      supersededBy: null,
      replace: () => {
        slot.supersededBy = 'replaced';
        slot.stream?.fail(SttStreamErrorCode.STREAM_REPLACED, REPLACED_MESSAGE);
      },
    };
    this.slots.get(userId)?.replace();
    this.slots.set(userId, slot);
    const release = () => {
      if (this.slots.get(userId) === slot) this.slots.delete(userId);
    };
    try {
      const stream = new SttStream(
        {
          opener: this.live,
          usage: this.usage,
          options: this.options,
          userId,
          meetingId,
          language: request.language,
          assertConsent: () => this.stt.assertConsent(userId),
          tokenExpiresAtMs: tokenExpiresAtSec === undefined ? undefined : tokenExpiresAtSec * 1000,
        },
        sink,
        release,
      );
      slot.stream = stream;
      await stream.start();
      if (slot.supersededBy) {
        stream.close();
        throw new SttStreamRefusal(SttStreamErrorCode.STREAM_REPLACED, REPLACED_MESSAGE);
      }
      return stream;
    } catch (error) {
      release();
      if (slot.supersededBy) throw new SttStreamRefusal(SttStreamErrorCode.STREAM_REPLACED, REPLACED_MESSAGE);
      throw refusalFor(error, this.logger);
    }
  }
  /** At most `maxStartsPerMinute` starts per user in any minute — a reconnect storm must not hammer Gemini. */
  private assertStartRate(userId: string): void {
    const now = Date.now();
    const recent = (this.startTimes.get(userId) ?? []).filter((t) => now - t < 60_000);
    if (recent.length >= (this.options.maxStartsPerMinute ?? 5)) {
      this.startTimes.set(userId, recent);
      throw new SttStreamRefusal(SttStreamErrorCode.RATE_LIMITED, 'Bắt đầu nhận diện quá nhiều lần, thử lại sau ít phút');
    }
    this.startTimes.set(userId, [...recent, now]);
  }
}

function parseStart(body: unknown): SttStreamStartPayload {
  const { language, meeting_id: meetingId } = (body ?? {}) as Partial<Record<keyof SttStreamStartPayload, unknown>>;
  if (typeof language !== 'string' || !(STT_LANGUAGES as readonly string[]).includes(language)) {
    throw new SttStreamRefusal(SttStreamErrorCode.VALIDATION_ERROR, 'Ngôn ngữ nhận diện không được hỗ trợ');
  }
  if (meetingId !== undefined && (typeof meetingId !== 'string' || !UUID.test(meetingId))) {
    throw new SttStreamRefusal(SttStreamErrorCode.VALIDATION_ERROR, 'meeting_id không hợp lệ');
  }
  return { language: language as SttLanguage, meeting_id: meetingId };
}

function refusalFor(error: unknown, logger: Logger): SttStreamRefusal {
  if (error instanceof SttStreamRefusal) return error;
  if (error instanceof QuotaExceededError) return new SttStreamRefusal(SttStreamErrorCode.QUOTA_EXCEEDED, error.message);
  if (error instanceof AiServiceUnavailableError) return new SttStreamRefusal(SttStreamErrorCode.AI_SERVICE_UNAVAILABLE, error.message);
  logger.warn(`stt_start failed (${error instanceof Error ? error.name : 'Error'})`);
  return new SttStreamRefusal(SttStreamErrorCode.AI_SERVICE_UNAVAILABLE, 'Không bắt đầu được nhận diện giọng nói');
}
