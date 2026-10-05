import { HttpException, HttpStatus, Injectable, Logger, NotFoundException, OnModuleDestroy, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiErrorCode, type SegmentTranslation } from '@meetio/shared';
import { GeminiClient } from '../ai/gemini.client.js';
import { QuotaExceededError } from '../ai/ai-errors.js';
import { errorCode } from '../common/logging/log-error.js';
import { MeetingRoomNotifier } from '../realtime/meeting-room.notifier.js';
import { TranslationBatcher, type BatchItem } from './translation-batcher.js';
import { buildTranslationRequest, parseTranslations } from './translation-prompt.js';
import { TranslationSettingsCache } from './translation-settings-cache.js';
import { TranslationStore, type TranslationTarget } from './translation-store.js';

// Sized for streamed recognition (many short finals): a longer window, bigger batches, fewer calls.
const DEFAULT_WINDOW_MS = 4000;
const DEFAULT_MAX_BATCH = 8;
/** How long a meeting's translation settings are trusted before the next read (PATCH calls `forget`). */
const SETTINGS_TTL_MS = 30_000;

const positive = (raw: string | undefined, fallback: number) => (Number(raw) > 0 ? Number(raw) : fallback);

interface MeetingState {
  batcher: TranslationBatcher;
  /** Latest settings seen for the meeting; a batch is translated with these. */
  target: TranslationTarget & { translateTo: string };
}

/**
 * Phase 09. Segments of a meeting with `translate_to` set are gathered for ~4s
 * or 8 segments and translated in one Gemini call; a batch that comes back
 * incomplete or unparsable falls back to one call per missing segment, so one bad
 * sentence never costs the others. A segment that still fails stays untranslated
 * and the client is told (`segment_translation_failed`) so it can offer a retry.
 * Segment text is never logged (NFR-04): only meeting ids, seqs and counts.
 */
@Injectable()
export class TranslationService implements OnModuleDestroy {
  private readonly logger = new Logger(TranslationService.name);
  private readonly meetings = new Map<string, MeetingState>();
  private readonly settings: TranslationSettingsCache;
  private readonly windowMs: number;
  private readonly maxBatch: number;

  constructor(
    private readonly store: TranslationStore,
    private readonly gemini: GeminiClient,
    private readonly notifier: MeetingRoomNotifier,
    config: ConfigService,
  ) {
    this.settings = new TranslationSettingsCache((id) => store.targetFor(id), SETTINGS_TTL_MS);
    this.windowMs = positive(config.get<string>('TRANSLATION_BATCH_WINDOW_MS'), DEFAULT_WINDOW_MS);
    this.maxBatch = positive(config.get<string>('TRANSLATION_BATCH_MAX'), DEFAULT_MAX_BATCH);
  }

  /**
   * Called after segments are durably written (for a meeting with translation off it costs no DB read within the settings TTL). Fire-and-forget: it never throws and
   * never makes the caller wait, so the ack path is unaffected by translation.
   */
  enqueue(meetingId: string, seqs: readonly number[]): void {
    this.admit(meetingId, seqs).catch((error: unknown) => {
      this.logger.error(`Translation enqueue failed meeting=${meetingId} error=${errorCode(error)}`);
    });
  }

  /** Drops the cached settings of a meeting — call when its `translate_to` changes. */
  forget(meetingId: string): void {
    this.settings.forget(meetingId);
  }

  /** Manual retry of one segment (owner only). Resolves with the stored translation, or throws an HTTP error. */
  async retry(meetingId: string, userId: string, seq: number): Promise<SegmentTranslation> {
    const target = await this.store.targetFor(meetingId, userId);
    if (!target) throw new NotFoundException({ code: ApiErrorCode.MEETING_NOT_FOUND, message: 'Không tìm thấy cuộc họp', details: {} });
    if (!target.translateTo) {
      throw new BadRequestException({ code: ApiErrorCode.VALIDATION_ERROR, message: 'Cuộc họp này chưa bật dịch', details: {} });
    }
    const segment = await this.store.segment(meetingId, seq);
    if (!segment) throw new NotFoundException({ code: ApiErrorCode.NOT_FOUND, message: 'Không tìm thấy đoạn transcript', details: {} });
    // Idempotent only for a translation into the language the meeting wants now; one made for an
    // earlier target is stale and gets translated again (saveTranslation overwrites exactly that case).
    if (segment.translatedText !== null && segment.translatedTo === target.translateTo) {
      return { seq, translated_text: segment.translatedText, translated_to: segment.translatedTo };
    }
    const to = target.translateTo;
    let translated: string | undefined;
    try {
      translated = (await this.translate(meetingId, { ...target, translateTo: to }, [{ seq, text: segment.text }])).get(seq);
    } catch (error) {
      throw this.toHttpError(error);
    }
    if (translated === undefined) {
      throw new HttpException(
        { code: ApiErrorCode.AI_SERVICE_UNAVAILABLE, message: 'Chưa dịch được đoạn này — thử lại sau', details: {} },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    if (!(await this.store.saveTranslation(meetingId, seq, translated, to))) {
      // Another writer got there first (or translation was switched off): report what is stored.
      const current = await this.store.segment(meetingId, seq);
      if (current?.translatedText && current.translatedTo === to) {
        return { seq, translated_text: current.translatedText, translated_to: current.translatedTo };
      }
      throw new BadRequestException({ code: ApiErrorCode.VALIDATION_ERROR, message: 'Cuộc họp này chưa bật dịch', details: {} });
    }
    const payload = { seq, translated_text: translated, translated_to: to };
    this.notifier.segmentTranslated(meetingId, payload);
    return payload;
  }

  onModuleDestroy(): void {
    this.meetings.forEach((m) => m.batcher.dispose());
    this.meetings.clear();
  }

  private async admit(meetingId: string, seqs: readonly number[]): Promise<void> {
    const target = await this.settings.get(meetingId);
    if (!target?.translateTo) return;
    const pending = await this.store.untranslated(meetingId, seqs);
    if (pending.length === 0) return;
    const state = this.stateFor(meetingId, { ...target, translateTo: target.translateTo });
    pending.forEach((item) => state.batcher.add(item));
  }

  private stateFor(meetingId: string, target: MeetingState['target']): MeetingState {
    let state = this.meetings.get(meetingId);
    if (!state) {
      const created: MeetingState = {
        target,
        batcher: new TranslationBatcher({
          windowMs: this.windowMs,
          maxBatch: this.maxBatch,
          onFlush: (items) => this.flush(meetingId, created, items),
          onError: (error) => this.logger.error(`Translation batch failed meeting=${meetingId} error=${errorCode(error)}`),
          onIdle: () => {
            if (this.meetings.get(meetingId) === created) this.meetings.delete(meetingId);
          },
        }),
      };
      this.meetings.set(meetingId, created);
      state = created;
    }
    state.target = target;
    return state;
  }

  private async flush(meetingId: string, state: MeetingState, items: BatchItem[]): Promise<void> {
    const { target } = state;
    const done = new Map<number, string>();
    const failAll = (pending: BatchItem[]) => pending.forEach((i) => this.fail(meetingId, i.seq));
    if (items.length > 1) {
      try {
        for (const [seq, text] of await this.translate(meetingId, target, items)) done.set(seq, text);
      } catch (error) {
        // A provider / transport / budget error is not about one sentence: splitting the batch would
        // only repeat the failure N times. The client offers a manual retry per segment instead.
        this.logger.warn(
          error instanceof QuotaExceededError
            ? `Translation paused, AI budget spent meeting=${meetingId}`
            : `Translation batch failed meeting=${meetingId} size=${items.length} error=${errorCode(error)}`,
        );
        failAll(items);
        return;
      }
    }
    // The batch answered but was unparsable or incomplete: one by one for what is missing, so a
    // single garbled sentence does not sink its neighbours.
    const missing = items.filter((i) => !done.has(i.seq));
    for (const [index, item] of missing.entries()) {
      try {
        const single = (await this.translate(meetingId, target, [item])).get(item.seq);
        if (single === undefined) this.fail(meetingId, item.seq);
        else done.set(item.seq, single);
      } catch (error) {
        this.logger.warn(`Translating segment failed meeting=${meetingId} seq=${item.seq} error=${errorCode(error)}`);
        failAll(missing.slice(index));
        break;
      }
    }
    await Promise.all(
      items.map(async ({ seq }) => {
        const text = done.get(seq);
        if (text === undefined) return;
        try {
          if (await this.store.saveTranslation(meetingId, seq, text, target.translateTo)) {
            this.notifier.segmentTranslated(meetingId, { seq, translated_text: text, translated_to: target.translateTo });
          }
        } catch (error) {
          this.logger.error(`Saving translation failed meeting=${meetingId} seq=${seq} error=${errorCode(error)}`);
          this.fail(meetingId, seq);
        }
      }),
    );
  }

  private async translate(meetingId: string, target: MeetingState['target'], items: BatchItem[]): Promise<Map<number, string>> {
    const request = buildTranslationRequest(items, target.sourceLanguage, target.translateTo);
    const response = await this.gemini.generateText({ ...request, userId: target.userId, meetingId, operation: 'translate' });
    return parseTranslations(response.text, items);
  }

  private fail(meetingId: string, seq: number): void {
    this.notifier.segmentTranslationFailed(meetingId, { seq });
  }

  private toHttpError(error: unknown): unknown {
    if (error instanceof QuotaExceededError) {
      return new HttpException({ code: ApiErrorCode.QUOTA_EXCEEDED, message: 'Đã hết hạn mức AI trong tháng', details: {} }, HttpStatus.TOO_MANY_REQUESTS);
    }
    this.logger.warn(`Translation retry failed error=${errorCode(error)}`);
    return new HttpException(
      { code: ApiErrorCode.AI_SERVICE_UNAVAILABLE, message: 'Dịch vụ AI tạm thời không dùng được — thử lại sau', details: {} },
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }
}
