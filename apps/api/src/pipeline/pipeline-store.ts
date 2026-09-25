import type { DataSource, EntityManager } from 'typeorm';
import type { ProcessingStep } from '@meetio/shared';
import { MeetingStatus } from '../database/enums/meeting-status.enum.js';
import { transition } from '../meetings/meeting-state-machine.js';
import { STEP_ORDER } from './pipeline-steps.js';

export interface RunState {
  meetingId: string;
  userId: string;
  run: number;
  scope: 'full' | 'changed';
  changedSince: Date | null;
}

interface MeetingRow {
  id: string;
  user_id: string;
  status: MeetingStatus;
  pipeline_run: number;
  pipeline_scope: 'full' | 'changed';
  pipeline_changed_since: Date | null;
}

const toState = (m: MeetingRow): RunState => ({
  meetingId: m.id,
  userId: m.user_id,
  run: m.pipeline_run,
  scope: m.pipeline_scope,
  changedSince: m.pipeline_changed_since,
});

/**
 * Durable pipeline state. `processing_jobs` + the meeting row are the source of
 * truth; Redis only carries work (phase-11 "Kiến trúc"). Every write re-checks,
 * under the meeting's row lock, that the job belongs to the current run and the
 * meeting is still `processing` — a job left over from an older run, or for a
 * deleted meeting, changes nothing.
 */
export class PipelineStore {
  constructor(private readonly dataSource: DataSource) {}

  /** queued → processing, creates the five step rows, and returns the run — or null if the job is stale. */
  startRun(meetingId: string, jobRun: number | undefined): Promise<RunState | null> {
    return this.dataSource.transaction(async (m) => {
      const meeting = await this.lock(m, meetingId);
      if (!meeting || (jobRun !== undefined && jobRun !== meeting.pipeline_run)) return null;
      if (meeting.status === MeetingStatus.QUEUED) {
        const next = transition(meeting.status, 'start_processing');
        const [updated] = (await m.query(
          // pipeline_changed_since is set by whoever queued the run (reindex), never
          // here: resuming a failed `changed` run must keep the original edit window.
          `UPDATE meetings SET status = $2, pipeline_started_at = now(), updated_at = now()
           WHERE id = $1 RETURNING id, user_id, status, pipeline_run, pipeline_scope, pipeline_changed_since`,
          [meetingId, next],
        )) as [MeetingRow[], number];
        Object.assign(meeting, updated[0]);
      } else if (meeting.status !== MeetingStatus.PROCESSING) {
        return null;
      }
      await m.query(
        `INSERT INTO processing_jobs (meeting_id, step) SELECT $1, s FROM unnest($2::job_step[]) AS s
         ON CONFLICT (meeting_id, step) DO NOTHING`,
        [meetingId, STEP_ORDER],
      );
      return toState(meeting);
    });
  }

  /** The current run, if `run` is it and the meeting is still processing. */
  async current(meetingId: string, run: number): Promise<RunState | null> {
    const [meeting] = (await this.dataSource.query(
      `SELECT id, user_id, status, pipeline_run, pipeline_scope, pipeline_changed_since
       FROM meetings WHERE id = $1 AND deleted_at IS NULL`,
      [meetingId],
    )) as MeetingRow[];
    return meeting && meeting.pipeline_run === run && meeting.status === MeetingStatus.PROCESSING ? toState(meeting) : null;
  }

  /** First step, in pipeline order, not yet succeeded — or null when all five have. */
  async nextStep(meetingId: string): Promise<ProcessingStep | null> {
    const rows = (await this.dataSource.query('SELECT step, status FROM processing_jobs WHERE meeting_id = $1', [
      meetingId,
    ])) as { step: ProcessingStep; status: string }[];
    const done = new Set(rows.filter((r) => r.status === 'succeeded').map((r) => r.step));
    return STEP_ORDER.find((step) => !done.has(step)) ?? null;
  }

  markRunning(state: RunState, step: ProcessingStep): Promise<boolean> {
    return this.stepWrite(state, (m) =>
      m.query(
        `UPDATE processing_jobs SET status = 'running', attempts = attempts + 1, started_at = now(),
           finished_at = NULL, error_message = NULL
         WHERE meeting_id = $1 AND step = $2 AND status <> 'succeeded'`,
        [state.meetingId, step],
      ),
    );
  }

  markSucceeded(state: RunState, step: ProcessingStep): Promise<boolean> {
    return this.stepWrite(state, (m) =>
      m.query(`UPDATE processing_jobs SET status = 'succeeded', finished_at = now(), error_message = NULL WHERE meeting_id = $1 AND step = $2`, [
        state.meetingId,
        step,
      ]),
    );
  }

  /** A failed attempt that will be retried: back to pending, message kept for investigation (US-29). */
  recordAttemptError(state: RunState, step: ProcessingStep, message: string): Promise<boolean> {
    return this.stepWrite(state, (m) =>
      m.query(`UPDATE processing_jobs SET status = 'pending', error_message = $3 WHERE meeting_id = $1 AND step = $2`, [
        state.meetingId,
        step,
        message,
      ]),
    );
  }

  /** Out of attempts: the step is `failed` and so is the meeting, naming the step. The transcript is untouched. */
  failStep(state: RunState, step: ProcessingStep, message: string): Promise<boolean> {
    return this.stepWrite(state, async (m) => {
      await m.query(`UPDATE processing_jobs SET status = 'failed', finished_at = now(), error_message = $3 WHERE meeting_id = $1 AND step = $2`, [
        state.meetingId,
        step,
        message,
      ]);
      await m.query(`UPDATE meetings SET status = $2, failure_reason = $3, updated_at = now() WHERE id = $1`, [
        state.meetingId,
        transition(MeetingStatus.PROCESSING, 'fail'),
        step,
      ]);
    });
  }

  /** processing → ready. Returns false when another worker already completed it. */
  completeRun(state: RunState): Promise<boolean> {
    return this.stepWrite(state, (m) =>
      m.query(`UPDATE meetings SET status = $2, failure_reason = NULL, updated_at = now() WHERE id = $1`, [
        state.meetingId,
        transition(MeetingStatus.PROCESSING, 'complete'),
      ]),
    );
  }

  /** Meetings sitting in `processing` untouched since `before` — paused at a missing handler, or a lost job. */
  async stalledRuns(before: Date, limit = 500): Promise<RunState[]> {
    const rows = (await this.dataSource.query(
      `SELECT id, user_id, status, pipeline_run, pipeline_scope, pipeline_changed_since FROM meetings
       WHERE status = 'processing' AND deleted_at IS NULL AND updated_at < $1 ORDER BY id LIMIT $2`,
      [before, limit],
    )) as MeetingRow[];
    return rows.map(toState);
  }

  private async lock(m: EntityManager, meetingId: string): Promise<MeetingRow | undefined> {
    const [row] = (await m.query(
      `SELECT id, user_id, status, pipeline_run, pipeline_scope, pipeline_changed_since
       FROM meetings WHERE id = $1 AND deleted_at IS NULL FOR NO KEY UPDATE`,
      [meetingId],
    )) as MeetingRow[];
    return row;
  }

  private stepWrite(state: RunState, write: (m: EntityManager) => Promise<unknown>): Promise<boolean> {
    return this.dataSource.transaction(async (m) => {
      const meeting = await this.lock(m, state.meetingId);
      if (!meeting || meeting.pipeline_run !== state.run || meeting.status !== MeetingStatus.PROCESSING) {
        return false;
      }
      await write(m);
      await m.query('UPDATE meetings SET updated_at = now() WHERE id = $1', [state.meetingId]);
      return true;
    });
  }
}
