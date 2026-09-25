import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource } from 'typeorm';
import { MeetingStatus } from '../database/enums/meeting-status.enum.js';
import type { Meeting } from '../database/entities/index.js';
import { SegmentBatchWriter } from '../segments/segment-batch-writer.service.js';
import { SegmentUpsertRepository } from '../segments/segment-upsert.repository.js';
import { MeetingsRepository } from './meetings.repository.js';
import { transition } from './meeting-state-machine.js';
import { closePause, openPause, recordedDurationSec } from './meeting-timing.js';
import { defaultMeetingTitle } from './default-meeting-title.js';
import { MeetingPipelineTrigger } from './meeting-pipeline.trigger.js';
import { SegmentsPendingException } from './segments-pending.exception.js';
import { toMeetingStateResponse } from './meeting-state-response.js';
import type { CreateMeetingDto } from './dto/create-meeting.dto.js';
import type { UpdateMeetingDto } from './dto/update-meeting.dto.js';
import type { CreateMeetingResponseDto, MeetingStateResponseDto } from './dto/meeting-responses.dto.js';

const MISSING_SEQS_REPORTED = 100;

/**
 * Lifecycle writes: create, pause, resume, end, rename. Every status change
 * runs inside one transaction that row-locks the meeting first, so two
 * concurrent `end` calls serialise and the second one sees `queued` → 409.
 */
@Injectable()
export class MeetingsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly meetings: MeetingsRepository,
    private readonly segmentWriter: SegmentBatchWriter,
    private readonly segments: SegmentUpsertRepository,
    private readonly pipeline: MeetingPipelineTrigger,
  ) {}

  /** US-07: the row exists — and its id is returned — before the client opens the mic. */
  async create(userId: string, dto: CreateMeetingDto): Promise<CreateMeetingResponseDto> {
    const now = new Date();
    const meeting = await this.meetings.createForUser(userId, {
      title: dto.title?.trim() || defaultMeetingTitle(now),
      status: MeetingStatus.RECORDING,
      source_language: dto.source_language,
      translate_to: dto.translate_to ?? null,
      audio_source: dto.audio_source,
      recording_quality: dto.recording_quality,
      started_at: now,
      last_activity_at: now,
    });
    return { id: meeting.id, status: meeting.status, started_at: now.toISOString() };
  }

  pause(id: string, userId: string): Promise<MeetingStateResponseDto> {
    return this.changeState(id, userId, (meeting, now) => {
      meeting.status = transition(meeting.status, 'pause');
      openPause(meeting, now);
    });
  }

  resume(id: string, userId: string): Promise<MeetingStateResponseDto> {
    return this.changeState(id, userId, (meeting, now) => {
      meeting.status = transition(meeting.status, 'resume');
      closePause(meeting, now);
    });
  }

  /**
   * US-16: succeeds only once seqs 1..lastSeq are all in PostgreSQL.
   *
   * Everything expensive happens before the row lock: the batch writer is
   * flushed (its insert takes that same lock) and the missing-seq scan runs
   * (client-sized, up to 1M). That is safe because the set of missing seqs
   * only ever shrinks while a meeting is live — a check that passed here still
   * holds once the lock is taken. The transaction then re-validates the move,
   * which is what makes a concurrent second `end` fail with 409.
   */
  async end(id: string, userId: string, lastSeq: number | undefined): Promise<MeetingStateResponseDto> {
    const current = await this.meetings.findOneOrFail(id, userId);
    transition(current.status, 'end'); // an already-ended meeting gets 409 before any scan
    await this.segmentWriter.flush(id);
    if (lastSeq) {
      const missing = await this.segments.findMissingSeqs(id, lastSeq, MISSING_SEQS_REPORTED);
      if (missing.count > 0) {
        throw new SegmentsPendingException({ missing_count: missing.count, missing_seqs: missing.seqs });
      }
    }

    const response = await this.changeStateReturningRun(id, userId, (meeting, now) => {
      const ended = transition(meeting.status, 'end');
      meeting.duration_sec = recordedDurationSec(meeting, now);
      closePause(meeting, now);
      meeting.ended_at = now;
      meeting.status = transition(ended, 'enqueue');
      meeting.pipeline_run += 1;
      meeting.pipeline_scope = 'full';
    });
    await this.pipeline.enqueueAfterCommit(id, response.run);
    return response.state;
  }

  async update(id: string, userId: string, dto: UpdateMeetingDto): Promise<Meeting> {
    const patch: Partial<Meeting> = {};
    if (dto.title !== undefined) {
      const title = dto.title.trim();
      // US-25: an emptied title falls back to the time-based default, never a blank string.
      patch.title = title || defaultMeetingTitle((await this.meetings.findOneOrFail(id, userId)).started_at ?? new Date());
    }
    if (dto.translate_to !== undefined) {
      patch.translate_to = dto.translate_to;
    }
    return this.meetings.updateOwned(id, userId, patch);
  }

  private async changeState(
    id: string,
    userId: string,
    apply: (meeting: Meeting, now: Date) => void | Promise<void>,
  ): Promise<MeetingStateResponseDto> {
    return (await this.changeStateReturningRun(id, userId, apply)).state;
  }

  private async changeStateReturningRun(
    id: string,
    userId: string,
    apply: (meeting: Meeting, now: Date) => void | Promise<void>,
  ): Promise<{ state: MeetingStateResponseDto; run: number }> {
    return this.dataSource.transaction(async (manager) => {
      const meeting = await this.meetings.lockOwned(manager, id, userId);
      const now = new Date();
      await apply(meeting, now);
      meeting.last_activity_at = now;
      const saved = await manager.save(meeting);
      return { state: toMeetingStateResponse(saved), run: saved.pipeline_run };
    });
  }
}
