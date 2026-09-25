import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource } from 'typeorm';
import { ApiErrorCode, type ProcessingStep } from '@meetio/shared';
import { MeetingStatus } from '../database/enums/meeting-status.enum.js';
import { MeetingsRepository } from '../meetings/meetings.repository.js';
import { MeetingPipelineTrigger } from '../meetings/meeting-pipeline.trigger.js';
import { transition } from '../meetings/meeting-state-machine.js';
import { hasUnprocessedEdits } from '../meetings/meeting-edits.js';
import { toMeetingStateResponse } from '../meetings/meeting-state-response.js';
import type { MeetingStateResponseDto } from '../meetings/dto/meeting-responses.dto.js';
import { STEP_ORDER } from './pipeline-steps.js';
import type { MeetingStatusResponseDto } from './dto/pipeline.dto.js';

const iso = (d: Date | null) => (d ? d.toISOString() : null);

/** `POST /meetings/:id/reindex` and `GET /meetings/:id/status` (api-spec §3, US-24, US-28, US-29). */
@Injectable()
export class PipelineControlService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly meetings: MeetingsRepository,
    private readonly trigger: MeetingPipelineTrigger,
  ) {}

  /**
   * Queues a new run (new run number → new job id, so it is never swallowed as a duplicate).
   * - ready + changed: redo every step, scoped to segments edited since the last run began;
   *   400 when nothing was edited — re-running an unchanged meeting only burns money.
   * - failed + changed: resume — only failed steps go back to pending, succeeded ones are skipped.
   * - full: every step from scratch.
   * The old summary stays readable while the run is queued/processing.
   */
  async reindex(meetingId: string, userId: string, scope: 'changed' | 'full'): Promise<MeetingStateResponseDto> {
    const { state, run } = await this.dataSource.transaction(async (m) => {
      const meeting = await this.meetings.lockOwned(m, meetingId, userId);
      const next = transition(meeting.status, 'requeue');
      const resume = scope === 'changed' && meeting.status === MeetingStatus.FAILED;

      if (scope === 'changed' && !resume && !(await hasUnprocessedEdits(m, meetingId))) {
        throw new BadRequestException({
          code: ApiErrorCode.VALIDATION_ERROR,
          message: 'Transcript chưa có chỗ nào được sửa từ lần xử lý trước',
          details: { scope: 'nothing_changed' },
        });
      }
      await m.query(
        `UPDATE processing_jobs SET status = 'pending', attempts = 0, error_message = NULL, started_at = NULL, finished_at = NULL
         WHERE meeting_id = $1 AND ($2::boolean = false OR status = 'failed')`,
        [meetingId, resume],
      );
      if (!resume) {
        meeting.pipeline_scope = scope;
        // A `changed` run redoes what was edited after the previous run began.
        meeting.pipeline_changed_since = scope === 'changed' ? meeting.pipeline_started_at : null;
      }
      meeting.status = next;
      meeting.failure_reason = null;
      meeting.pipeline_run += 1;
      const saved = await m.save(meeting);
      return { state: toMeetingStateResponse(saved), run: saved.pipeline_run };
    });
    await this.trigger.enqueueAfterCommit(meetingId, run);
    return state;
  }

  async status(meetingId: string, userId: string): Promise<MeetingStatusResponseDto> {
    const meeting = await this.meetings.findOneOrFail(meetingId, userId);
    const [rows, edited] = await Promise.all([
      this.dataSource.query(
        `SELECT step, status, attempts, error_message, started_at, finished_at FROM processing_jobs WHERE meeting_id = $1`,
        [meetingId],
      ) as Promise<
        { step: ProcessingStep; status: 'pending' | 'running' | 'succeeded' | 'failed'; attempts: number; error_message: string | null; started_at: Date | null; finished_at: Date | null }[]
      >,
      hasUnprocessedEdits(this.dataSource, meetingId),
    ]);
    const steps = STEP_ORDER.flatMap((step) => rows.filter((r) => r.step === step)).map((r) => ({
      step: r.step,
      status: r.status,
      attempts: r.attempts,
      error_message: r.error_message,
      started_at: iso(r.started_at),
      finished_at: iso(r.finished_at),
    }));
    const inFlight = meeting.status === MeetingStatus.PROCESSING || meeting.status === MeetingStatus.QUEUED;
    const current =
      steps.find((s) => s.status === 'running')?.step ??
      steps.find((s) => s.status === 'failed')?.step ??
      (inFlight ? (steps.find((s) => s.status !== 'succeeded')?.step ?? null) : null);
    return {
      meeting_id: meeting.id,
      status: meeting.status,
      current_step: current,
      steps,
      failure_reason: meeting.failure_reason,
      has_unprocessed_edits: edited,
    };
  }
}
