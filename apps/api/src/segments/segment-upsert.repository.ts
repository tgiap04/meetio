import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource, EntityManager } from 'typeorm';
import { ApiErrorCode } from '@meetio/shared';
import type { MeetingStatus } from '../database/enums/meeting-status.enum.js';
import { acceptsSegments } from '../meetings/meeting-state-machine.js';
import { SegmentRejectedError } from './segment-rejected.error.js';
import type { SegmentInput } from './segment-input.js';

// 5 bind parameters per row; Postgres caps a statement at 65,535.
const MAX_ROWS_PER_INSERT = 1000;

/**
 * The single write path for transcript segments — WebSocket and `bulk` both land here.
 *
 * `ON CONFLICT (meeting_id, seq) DO NOTHING`: once a seq has a row, a resend is
 * a no-op, never an overwrite, so a retry can never clobber text the user has
 * since edited (clarifications 2026-09-25). Among copies still in flight at the
 * same moment, whichever commits first wins — they carry the same text anyway. The caller acks every seq it passed in whether it
 * was new or a duplicate — either way the row is durable when this resolves.
 */
@Injectable()
export class SegmentUpsertRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async upsertMany(meetingId: string, segments: readonly SegmentInput[]): Promise<void> {
    if (segments.length === 0) {
      return;
    }
    await this.dataSource.transaction(async (manager) => {
      // One lock, taken first: serialises writers for this meeting against each
      // other and against `end`/`delete` (which lock the same row), so the status
      // checked here cannot change before the insert commits — and there is no
      // second lock to take later, so no lock-upgrade deadlock.
      const rows = (await manager.query(
        'SELECT status FROM meetings WHERE id = $1 AND deleted_at IS NULL FOR NO KEY UPDATE',
        [meetingId],
      )) as { status: MeetingStatus }[];
      if (rows.length === 0) {
        throw new SegmentRejectedError(ApiErrorCode.MEETING_NOT_FOUND, 'Không tìm thấy cuộc họp');
      }
      if (!acceptsSegments(rows[0].status)) {
        throw new SegmentRejectedError(
          ApiErrorCode.INVALID_STATE_TRANSITION,
          `Cuộc họp đang ở trạng thái ${rows[0].status}, không nhận thêm đoạn transcript`,
        );
      }
      for (let i = 0; i < segments.length; i += MAX_ROWS_PER_INSERT) {
        await this.insertChunk(manager, meetingId, segments.slice(i, i + MAX_ROWS_PER_INSERT));
      }
      // Feeds the 24h abandoned-meeting sweep (phase-04 step 8, phase-05 step 7).
      await manager.query('UPDATE meetings SET last_activity_at = now() WHERE id = $1', [meetingId]);
    });
  }

  private async insertChunk(manager: EntityManager, meetingId: string, segments: readonly SegmentInput[]): Promise<void> {
    const values: unknown[] = [meetingId];
    const rows = segments.map((s, i) => {
      const base = i * 5 + 2;
      values.push(s.seq, s.text, s.started_at_ms, s.ended_at_ms, s.gap_before_ms ?? null);
      return `($1, $${base}, $${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`;
    });
    await manager.query(
      `INSERT INTO transcript_segments (meeting_id, seq, text, started_at_ms, ended_at_ms, gap_before_ms)
       VALUES ${rows.join(', ')}
       ON CONFLICT (meeting_id, seq) DO NOTHING`,
      values,
    );
  }

  /**
   * Seqs in 1..lastSeq with no row yet, ascending, capped at `limit` — plus the
   * total missing count, so a client resending thousands of segments still
   * learns how far it has to go.
   */
  async findMissingSeqs(meetingId: string, lastSeq: number, limit: number): Promise<{ count: number; seqs: number[] }> {
    // Fast path — the normal end: seq is unique per meeting, so lastSeq rows in
    // 1..lastSeq means none is missing. One index range count, no series.
    const [{ present }] = (await this.dataSource.query(
      'SELECT count(*)::int AS present FROM transcript_segments WHERE meeting_id = $1 AND seq BETWEEN 1 AND $2',
      [meetingId, lastSeq],
    )) as { present: number }[];
    if (present === lastSeq) {
      return { count: 0, seqs: [] };
    }
    const rows = (await this.dataSource.query(
      `WITH missing AS (
         SELECT g.seq FROM generate_series(1, $2::int) AS g(seq)
         WHERE NOT EXISTS (SELECT 1 FROM transcript_segments t WHERE t.meeting_id = $1 AND t.seq = g.seq)
       )
       SELECT (SELECT count(*) FROM missing)::int AS count,
              COALESCE((SELECT array_agg(seq ORDER BY seq) FROM (SELECT seq FROM missing ORDER BY seq LIMIT $3) s), '{}') AS seqs`,
      [meetingId, lastSeq, limit],
    )) as { count: number; seqs: number[] }[];
    return rows[0];
  }
}
