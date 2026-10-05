import { Injectable, Logger } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ApiErrorCode, type SegmentErrorPayload } from '@meetio/shared';
import { SegmentBatchWriter } from '../segments/segment-batch-writer.service.js';
import { SegmentRejectedError } from '../segments/segment-rejected.error.js';
import { segmentRuleViolation } from '../segments/segment-rules.js';
import { SegmentDto } from '../segments/dto/segment.dto.js';
import { SegmentRateLimiter } from './segment-rate-limiter.js';
import type { MeetingSocketData } from './ws-auth.middleware.js';

export type SegmentOutcome =
  | { kind: 'ack'; seq: number }
  | { kind: 'error'; payload: SegmentErrorPayload; disconnect?: boolean };

const error = (seq: number, code: ApiErrorCode, message: string, disconnect = false): SegmentOutcome => ({
  kind: 'error',
  payload: { seq, code, message },
  disconnect,
});

/**
 * Everything `transcript_segment` does, minus the socket: validate, rate-limit,
 * hand to the batch writer, and decide between `segment_ack` and
 * `segment_error`. The ack is only ever produced after the write promise
 * resolves — i.e. after COMMIT (api-spec §8).
 */
@Injectable()
export class SegmentIngestHandler {
  private readonly logger = new Logger(SegmentIngestHandler.name);

  constructor(
    private readonly writer: SegmentBatchWriter,
    private readonly rateLimiter: SegmentRateLimiter,
  ) {}

  async handle(socket: MeetingSocketData, raw: unknown, nowMs = Date.now()): Promise<SegmentOutcome> {
    // A segment with no usable seq cannot be matched to the client's queue; -1 says so.
    const rawSeq = (raw as { seq?: unknown } | null)?.seq;
    const seq = typeof rawSeq === 'number' && Number.isInteger(rawSeq) ? rawSeq : -1;

    // The handshake token is checked once; a connection outliving it (a 60-min
    // meeting vs a 15-min token) is told to reconnect with a fresh one, so a
    // logged-out or deleted account cannot keep writing on an old socket.
    if (nowMs >= socket.tokenExp * 1000) {
      return error(seq, ApiErrorCode.TOKEN_EXPIRED, 'Access token đã hết hạn — kết nối lại với token mới', true);
    }
    const meetingId = socket.meetingId;
    if (!meetingId) {
      return error(seq, ApiErrorCode.VALIDATION_ERROR, 'Chưa join_meeting');
    }

    const segment = plainToInstance(SegmentDto, raw ?? {});
    const problems = await validate(segment, { whitelist: true, forbidNonWhitelisted: false });
    const ruleViolation = problems.length === 0 ? segmentRuleViolation(segment) : null;
    if (problems.length > 0 || ruleViolation) {
      const fields = problems.map((p) => p.property).join(', ');
      return error(seq, ApiErrorCode.VALIDATION_ERROR, ruleViolation ?? `Trường không hợp lệ: ${fields}`);
    }

    if (!(await this.rateLimiter.allow(meetingId))) {
      return error(seq, ApiErrorCode.RATE_LIMITED, 'Quá 120 đoạn/phút cho cuộc họp này — dùng /segments/bulk để gửi bù');
    }

    try {
      await this.writer.write(meetingId, {
        seq: segment.seq,
        text: segment.text,
        started_at_ms: segment.started_at_ms,
        ended_at_ms: segment.ended_at_ms,
        gap_before_ms: segment.gap_before_ms,
      });
      return { kind: 'ack', seq: segment.seq };
    } catch (failure) {
      if (failure instanceof SegmentRejectedError) {
        return error(segment.seq, failure.code, failure.message);
      }
      // NFR-04: never log transcript text — only which meeting, which seq, how long.
      this.logger.error(
        `Segment write failed meeting=${meetingId} seq=${segment.seq} length=${segment.text.length}`,
        failure instanceof Error ? failure.stack : undefined,
      );
      return error(segment.seq, ApiErrorCode.INTERNAL_ERROR, 'Không ghi được đoạn transcript — giữ lại và gửi lại sau');
    }
  }
}
