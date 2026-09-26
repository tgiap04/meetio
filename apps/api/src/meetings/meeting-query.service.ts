import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import type { DataSource, Repository } from 'typeorm';
import { ProcessingJob, TranscriptSegment } from '../database/entities/index.js';
import { MeetingsRepository } from './meetings.repository.js';
import { hasUnprocessedEdits } from './meeting-edits.js';
import { decodeMeetingCursor, encodeMeetingCursor } from './meeting-cursor.js';
import { toMeetingListItem, toMeetingProcessingStep } from './meeting-mappers.js';
import { loadActionItems, withoutMeeting } from '../actions/action-item-rows.js';
import type { ListMeetingsQueryDto } from './dto/list-meetings.query.dto.js';
import type { ListMeetingsResponseDto, MeetingDetailResponseDto } from './dto/meeting-responses.dto.js';

const DEFAULT_PAGE_SIZE = 20;
const STEP_ORDER = ['chunk', 'embed', 'extract', 'resolve', 'summarize'];

/** Read side of the meetings API: list and detail (api-spec §3). */
@Injectable()
export class MeetingQueryService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly meetings: MeetingsRepository,
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
    const [actionItems, jobs, segmentCount, edited] = await Promise.all([
      loadActionItems(this.dataSource, 'a.meeting_id = $1 AND a.user_id = $2', [id, userId]),
      this.jobs.find({ where: { meeting_id: id } }),
      this.segments.count({ where: { meeting_id: id } }),
      hasUnprocessedEdits(this.dataSource, id),
    ]);
    jobs.sort((a, b) => STEP_ORDER.indexOf(a.step) - STEP_ORDER.indexOf(b.step));

    return {
      ...toMeetingListItem(meeting),
      audio_source: meeting.audio_source,
      recording_quality: meeting.recording_quality,
      summary: meeting.summary,
      summary_citations: meeting.summary_citations as MeetingDetailResponseDto['summary_citations'],
      summary_insufficient: meeting.summary_insufficient,
      failure_reason: meeting.failure_reason,
      segment_count: segmentCount,
      // The DTO's status is the API-side enum of the same values.
      action_items: actionItems.map(withoutMeeting) as MeetingDetailResponseDto['action_items'],
      processing_steps: jobs.map(toMeetingProcessingStep),
      has_unprocessed_edits: edited,
      updated_at: meeting.updated_at.toISOString(),
    };
  }
}
