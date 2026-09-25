import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource } from 'typeorm';
import { Meeting } from '../database/entities/index.js';
import { MeetingStatus } from '../database/enums/meeting-status.enum.js';
import { transition } from '../meetings/meeting-state-machine.js';
import { closePause, recordedDurationSec } from '../meetings/meeting-timing.js';
import { MeetingPipelineTrigger } from '../meetings/meeting-pipeline.trigger.js';

const ABANDONED_AFTER_MS = 24 * 60 * 60 * 1000;
// A `queued` meeting untouched this long has lost its job (Redis blip after commit).
const STRANDED_AFTER_MS = 10 * 60 * 1000;
const BATCH = 500;

/**
 * System-level meeting sweeps — not user requests, so they use the raw
 * repository instead of `ScopedRepository`, like the account-maintenance job.
 */
@Injectable()
export class MeetingMaintenanceService {
  private readonly logger = new Logger(MeetingMaintenanceService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly pipeline: MeetingPipelineTrigger,
  ) {}

  /**
   * US-15: a `recording` or `paused` meeting with no activity for 24h is ended
   * and still processed, never left hanging. Each meeting is re-checked under
   * its row lock, so one that came back to life since the scan is left alone.
   */
  async closeAbandonedMeetings(now = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - ABANDONED_AFTER_MS);
    const candidates = (await this.dataSource.query(
      `SELECT id FROM meetings
       WHERE status IN ('recording', 'paused') AND deleted_at IS NULL
         AND COALESCE(last_activity_at, started_at, created_at) < $1
       ORDER BY id LIMIT $2`,
      [cutoff, BATCH],
    )) as { id: string }[];

    let closed = 0;
    for (const { id } of candidates) {
      if (await this.closeIfStillAbandoned(id, cutoff, now)) {
        closed += 1;
        await this.pipeline.enqueueAfterCommit(id);
      }
    }
    if (closed > 0) {
      this.logger.log(`Auto-ended ${closed} abandoned meeting(s)`);
    }
    return closed;
  }

  /** Re-enqueues `queued` meetings whose job never reached Redis. Idempotent: jobId = meeting id. */
  async requeueStrandedMeetings(now = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - STRANDED_AFTER_MS);
    const stranded = (await this.dataSource.query(
      `SELECT id FROM meetings WHERE status = 'queued' AND deleted_at IS NULL AND updated_at < $1 ORDER BY id LIMIT $2`,
      [cutoff, BATCH],
    )) as { id: string }[];
    for (const { id } of stranded) {
      await this.pipeline.enqueue(id);
    }
    return stranded.length;
  }

  private closeIfStillAbandoned(id: string, cutoff: Date, now: Date): Promise<boolean> {
    return this.dataSource.transaction(async (manager) => {
      const meeting = await manager
        .getRepository(Meeting)
        .createQueryBuilder('m')
        .setLock('for_no_key_update')
        .where('m.id = :id AND m.deleted_at IS NULL', { id })
        .getOne();
      const lastSeen = meeting?.last_activity_at ?? meeting?.started_at ?? meeting?.created_at;
      const stillAbandoned =
        meeting &&
        (meeting.status === MeetingStatus.RECORDING || meeting.status === MeetingStatus.PAUSED) &&
        lastSeen !== undefined &&
        lastSeen !== null &&
        lastSeen < cutoff;
      if (!stillAbandoned) {
        return false;
      }
      const ended = transition(meeting.status, 'end');
      // Measure up to the last sign of life, not to "now": 24 idle hours are not meeting time.
      const endedAt = lastSeen;
      meeting.duration_sec = recordedDurationSec(meeting, endedAt);
      closePause(meeting, endedAt);
      meeting.ended_at = endedAt;
      meeting.status = transition(ended, 'enqueue');
      meeting.last_activity_at = now;
      await manager.save(meeting);
      return true;
    });
  }
}
