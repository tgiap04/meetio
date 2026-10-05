import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { ApiErrorCode } from '@meetio/shared';
import { consentRequired, CURRENT_CONSENT_VERSION } from '../users/consent.js';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource } from 'typeorm';
import { MeetingStatus } from '../database/enums/meeting-status.enum.js';
import { Meeting } from '../database/entities/index.js';
import { SegmentBatchWriter } from '../segments/segment-batch-writer.service.js';
import { SegmentUpsertRepository } from '../segments/segment-upsert.repository.js';
import { MeetingsRepository } from './meetings.repository.js';
import { transition } from './meeting-state-machine.js';
import { clampInstant, closePause, MAX_OFFLINE_START_MS, openPause, recordedDurationSec } from './meeting-timing.js';
import { defaultMeetingTitle } from './default-meeting-title.js';
import { translateToViolation } from './translate-target.js';
import { MeetingPipelineTrigger } from './meeting-pipeline.trigger.js';
import { SegmentsPendingException } from './segments-pending.exception.js';
import { toMeetingStateResponse } from './meeting-state-response.js';
import type { CreateMeetingDto } from './dto/create-meeting.dto.js';
import type { EndMeetingDto, MeetingTransitionDto } from './dto/end-meeting.dto.js';
import type { UpdateMeetingDto } from './dto/update-meeting.dto.js';
import type { CreateMeetingResponseDto, MeetingStateResponseDto } from './dto/meeting-responses.dto.js';

const MISSING_SEQS_REPORTED = 100;

function assertTranslateTo(translateTo: string | null | undefined, sourceLanguage: string): void {
  const reason = translateToViolation(translateTo, sourceLanguage);
  if (reason) {
    throw new BadRequestException({ code: ApiErrorCode.VALIDATION_ERROR, message: reason, details: { translate_to: reason } });
  }
}

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
    // NFR-01: nothing is recorded — and so nothing reaches the AI provider — before the user accepted
    // the current consent text. Enforced here, not only by the app's gate.
    const [owner] = (await this.dataSource.query('SELECT consent_version FROM users WHERE id = $1', [userId])) as { consent_version: number | null }[];
    if (!owner || consentRequired(owner.consent_version)) {
      throw new ForbiddenException({
        code: ApiErrorCode.CONSENT_REQUIRED,
        message: 'Cần đồng ý với nội dung xử lý dữ liệu hiện hành trước khi ghi cuộc họp',
        details: { consent_version: CURRENT_CONSENT_VERSION },
      });
    }
    assertTranslateTo(dto.translate_to, dto.source_language);
    const now = new Date();
    // US-07 offline start: the client dates the meeting from when recording began, not from the replay.
    const startedAt = clampInstant(dto.started_at, new Date(now.getTime() - MAX_OFFLINE_START_MS), now);
    const values = {
      title: dto.title?.trim() || defaultMeetingTitle(startedAt),
      status: MeetingStatus.RECORDING,
      source_language: dto.source_language,
      translate_to: dto.translate_to ?? null,
      audio_source: dto.audio_source,
      recording_quality: dto.recording_quality,
      started_at: startedAt,
      last_activity_at: now,
    };
    if (!dto.id) {
      const meeting = await this.meetings.createForUser(userId, values);
      return { id: meeting.id, status: meeting.status, started_at: startedAt.toISOString() };
    }
    // Client-generated id: a replayed create must return the meeting it already made. INSERT … ON CONFLICT
    // DO NOTHING, never `save()` — that would UPDATE a row with this id, whoever owns it. Someone else's id
    // then reads as MEETING_NOT_FOUND, exactly like every other foreign meeting.
    await this.dataSource.createQueryBuilder().insert().into(Meeting).values({ ...values, id: dto.id, user_id: userId }).orIgnore().execute();
    const meeting = await this.meetings.findOneOrFail(dto.id, userId);
    return { id: meeting.id, status: meeting.status, started_at: (meeting.started_at ?? startedAt).toISOString() };
  }

  pause(id: string, userId: string, dto: MeetingTransitionDto = {}): Promise<MeetingStateResponseDto> {
    return this.changeState(id, userId, (meeting, now) => {
      meeting.status = transition(meeting.status, 'pause');
      openPause(meeting, clampInstant(dto.at, meeting.started_at, now));
    });
  }

  resume(id: string, userId: string, dto: MeetingTransitionDto = {}): Promise<MeetingStateResponseDto> {
    return this.changeState(id, userId, (meeting, now) => {
      meeting.status = transition(meeting.status, 'resume');
      closePause(meeting, clampInstant(dto.at, meeting.paused_at, now));
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
  async end(id: string, userId: string, dto: EndMeetingDto = {}): Promise<MeetingStateResponseDto> {
    const lastSeq = dto.last_seq;
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
      const endedAt = clampInstant(dto.at, meeting.paused_at ?? meeting.started_at, now);
      meeting.duration_sec = recordedDurationSec(meeting, endedAt);
      closePause(meeting, endedAt);
      meeting.ended_at = endedAt;
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
      if (dto.translate_to !== null) {
        assertTranslateTo(dto.translate_to, (await this.meetings.findOneOrFail(id, userId)).source_language);
      }
      patch.translate_to = dto.translate_to;
    }
    const updated = await this.meetings.updateOwned(id, userId, patch);
    return updated;
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
