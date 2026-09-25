import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource } from 'typeorm';
import { ApiErrorCode } from '@meetio/shared';
import { TranscriptSegment } from '../database/entities/index.js';
import { MeetingStatus } from '../database/enums/meeting-status.enum.js';
import { OwnershipViolationException } from '../common/exceptions/ownership-violation.exception.js';
import { InvalidStateTransitionException } from '../meetings/invalid-state-transition.exception.js';
import { MeetingsRepository } from '../meetings/meetings.repository.js';
import type { ListSegmentsResponseDto, TranscriptSegmentItemDto } from './dto/transcript.dto.js';

const DEFAULT_PAGE = 200;

// Live transcript is owned by the recorder; `processing` means the pipeline is
// reading it right now. Any other state accepts a correction (clarifications 2026-09-25).
const EDITABLE: readonly MeetingStatus[] = [MeetingStatus.QUEUED, MeetingStatus.READY, MeetingStatus.FAILED];

export function toSegmentItem(s: TranscriptSegment): TranscriptSegmentItemDto {
  return {
    id: s.id,
    seq: s.seq,
    text: s.text,
    started_at_ms: s.started_at_ms,
    ended_at_ms: s.ended_at_ms,
    gap_before_ms: s.gap_before_ms,
    is_edited: s.is_edited,
    translated_text: s.translated_text,
    translated_to: s.translated_to,
  };
}

/** Reading and correcting the transcript (api-spec §4, US-23, US-24). */
@Injectable()
export class TranscriptService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly meetings: MeetingsRepository,
  ) {}

  async list(meetingId: string, userId: string, fromSeq = 1, limit = DEFAULT_PAGE): Promise<ListSegmentsResponseDto> {
    await this.meetings.findOneOrFail(meetingId, userId);
    const rows = await this.dataSource
      .getRepository(TranscriptSegment)
      .createQueryBuilder('s')
      .where('s.meeting_id = :meetingId AND s.seq >= :fromSeq', { meetingId, fromSeq })
      .orderBy('s.seq', 'ASC')
      .limit(limit + 1)
      .getMany();
    const page = rows.slice(0, limit);
    return {
      items: page.map(toSegmentItem),
      next_from_seq: rows.length > limit ? rows[limit].seq : null,
    };
  }

  /**
   * Corrects one segment. Does not touch the pipeline: re-processing costs time
   * and money, so the client asks the user first and then calls `reindex` (US-24).
   * `edited_at` is what later tells a `changed` run which segments to redo.
   */
  async update(segmentId: string, userId: string, text: string): Promise<TranscriptSegmentItemDto> {
    if (text.trim() === '') {
      throw new BadRequestException({
        code: ApiErrorCode.VALIDATION_ERROR,
        message: 'Nội dung đoạn không được để trống',
        details: { text: 'blank' },
      });
    }
    return this.dataSource.transaction(async (manager) => {
      const [owned] = (await manager.query(
        `SELECT s.meeting_id FROM transcript_segments s JOIN meetings m ON m.id = s.meeting_id
         WHERE s.id = $1 AND m.user_id = $2 AND m.deleted_at IS NULL`,
        [segmentId, userId],
      )) as { meeting_id: string }[];
      if (!owned) {
        throw new OwnershipViolationException(ApiErrorCode.NOT_FOUND, 'Không tìm thấy đoạn transcript');
      }
      // Same row lock as every other writer of this meeting — an edit cannot
      // interleave with the pipeline flipping the meeting to `processing`.
      const meeting = await this.meetings.lockOwned(manager, owned.meeting_id, userId);
      if (!EDITABLE.includes(meeting.status)) {
        throw new InvalidStateTransitionException(meeting.status, 'sửa transcript');
      }
      await manager.update(TranscriptSegment, { id: segmentId }, { text: text.trim(), is_edited: true, edited_at: new Date() });
      return toSegmentItem(await manager.findOneByOrFail(TranscriptSegment, { id: segmentId }));
    });
  }
}
