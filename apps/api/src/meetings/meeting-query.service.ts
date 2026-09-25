import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { ActionItem, ProcessingJob, TranscriptSegment } from '../database/entities/index.js';
import { MeetingsRepository } from './meetings.repository.js';
import { decodeMeetingCursor, encodeMeetingCursor } from './meeting-cursor.js';
import { toMeetingActionItem, toMeetingListItem, toMeetingProcessingStep } from './meeting-mappers.js';
import type { ListMeetingsQueryDto } from './dto/list-meetings.query.dto.js';
import type { ListMeetingsResponseDto, MeetingDetailResponseDto } from './dto/meeting-responses.dto.js';

const DEFAULT_PAGE_SIZE = 20;
const STEP_ORDER = ['chunk', 'embed', 'extract', 'resolve', 'summarize'];

/** Read side of the meetings API: list and detail (api-spec §3). */
@Injectable()
export class MeetingQueryService {
  constructor(
    private readonly meetings: MeetingsRepository,
    @InjectRepository(ActionItem) private readonly actionItems: Repository<ActionItem>,
    @InjectRepository(ProcessingJob) private readonly jobs: Repository<ProcessingJob>,
    @InjectRepository(TranscriptSegment) private readonly segments: Repository<TranscriptSegment>,
  ) {}

  async list(userId: string, query: ListMeetingsQueryDto): Promise<ListMeetingsResponseDto> {
    const { rows, nextCursor } = await this.meetings.listPage(userId, {
      q: query.q?.trim() || undefined,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
      status: query.status,
      cursor: query.cursor ? decodeMeetingCursor(query.cursor) : undefined,
      limit: query.limit ?? DEFAULT_PAGE_SIZE,
    });
    return {
      items: rows.map(toMeetingListItem),
      next_cursor: nextCursor ? encodeMeetingCursor(nextCursor) : null,
    };
  }

  /** Everything the detail screen needs except the segments, which page separately (api-spec §4). */
  async detail(id: string, userId: string): Promise<MeetingDetailResponseDto> {
    // Ownership first: the child queries below filter by meeting_id only.
    const meeting = await this.meetings.findOneOrFail(id, userId);
    const [actionItems, jobs, segmentCount] = await Promise.all([
      this.actionItems.find({ where: { meeting_id: id }, order: { created_at: 'ASC' } }),
      this.jobs.find({ where: { meeting_id: id } }),
      this.segments.count({ where: { meeting_id: id } }),
    ]);
    jobs.sort((a, b) => STEP_ORDER.indexOf(a.step) - STEP_ORDER.indexOf(b.step));

    return {
      ...toMeetingListItem(meeting),
      audio_source: meeting.audio_source,
      recording_quality: meeting.recording_quality,
      summary: meeting.summary,
      summary_citations: meeting.summary_citations,
      failure_reason: meeting.failure_reason,
      segment_count: segmentCount,
      action_items: actionItems.map(toMeetingActionItem),
      processing_steps: jobs.map(toMeetingProcessingStep),
      updated_at: meeting.updated_at.toISOString(),
    };
  }
}
