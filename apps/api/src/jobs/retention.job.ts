import { Injectable, Logger } from '@nestjs/common';
import { stackFrames } from '../common/logging/log-error.js';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource } from 'typeorm';
import type { RetentionNoticePushData } from '@meetio/shared';
import { MeetingDeletionService } from '../meetings/meeting-deletion.service.js';
import { ExpoPushClient } from '../notifications/expo-push.client.js';

/** How long before deletion the one reminder goes out (clarifications 2026-09-27). */
export const RETENTION_NOTICE_DAYS = 7;
/** Deletions per sweep — each is a full meeting delete; the next sweep continues. */
const DELETE_BATCH = 200;

/** When a meeting falls due: `retention_days` after it ended (or was created, if it never ended). */
const DUE = `COALESCE(m.ended_at, m.created_at) + make_interval(days => u.retention_days)`;

/**
 * Applies each user's retention setting (`users.retention_days`; NULL = keep forever).
 *
 * - A meeting due within 7 days, not yet announced, gets announced: one generic push per user
 *   ("N cuộc họp sẽ bị xóa sau 7 ngày") — never titles, which are personal data (NFR-01).
 * - A meeting past due is deleted exactly as if the user deleted it (MeetingDeletionService: one
 *   transaction, graph lock, orphaned entities removed).
 * Live meetings (recording/paused) are never touched.
 */
@Injectable()
export class RetentionService {
  private readonly logger = new Logger('Retention');

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly deletion: MeetingDeletionService,
    private readonly expo: ExpoPushClient,
  ) {}

  async apply(now = new Date()): Promise<{ notified: number; deleted: number }> {
    const notified = await this.announce(now);
    const due = (await this.dataSource.query(
      `SELECT m.id, m.user_id FROM meetings m JOIN users u ON u.id = m.user_id
       WHERE u.retention_days IS NOT NULL AND m.deleted_at IS NULL AND m.status NOT IN ('recording', 'paused')
         AND ${DUE} <= $1
       ORDER BY ${DUE} LIMIT ${DELETE_BATCH}`,
      [now],
    )) as { id: string; user_id: string }[];
    let deleted = 0;
    for (const m of due) {
      try {
        await this.deletion.delete(m.id, m.user_id);
        deleted++;
      } catch (error) {
        // One failure must not stop the sweep; the meeting is retried next time.
        this.logger.error(`retention delete failed for meeting ${m.id}`, stackFrames(error));
      }
    }
    if (notified || deleted) this.logger.log(`retention: ${notified} meeting(s) announced, ${deleted} deleted`);
    return { notified, deleted };
  }

  /** Claims the announcements in one UPDATE (a concurrent sweep cannot announce twice), then pushes per user. */
  private async announce(now: Date): Promise<number> {
    const [claimed] = (await this.dataSource.query(
      `UPDATE meetings m SET retention_notified_at = now()
       FROM users u
       WHERE u.id = m.user_id AND u.retention_days IS NOT NULL AND m.deleted_at IS NULL AND m.retention_notified_at IS NULL
         AND m.status NOT IN ('recording', 'paused')
         AND ${DUE} <= $1::timestamptz + make_interval(days => ${RETENTION_NOTICE_DAYS}) AND ${DUE} > $1
       RETURNING m.user_id`,
      [now],
    )) as [{ user_id: string }[], number];
    const perUser = new Map<string, number>();
    for (const r of claimed) perUser.set(r.user_id, (perUser.get(r.user_id) ?? 0) + 1);
    for (const [userId, count] of perUser) await this.push(userId, count);
    return claimed.length;
  }

  private async push(userId: string, count: number): Promise<void> {
    try {
      const tokens = (await this.dataSource.query('SELECT token FROM push_tokens WHERE user_id = $1', [userId])) as { token: string }[];
      if (tokens.length === 0) return;
      const data: RetentionNoticePushData = { type: 'retention_notice', meeting_count: count };
      await this.expo.send(
        tokens.map(({ token }) => ({
          to: token,
          title: 'Sắp đến hạn lưu trữ',
          body: `${count} cuộc họp sẽ bị xóa sau ${RETENTION_NOTICE_DAYS} ngày theo cài đặt lưu trữ của bạn.`,
          data: { ...data },
          sound: 'default' as const,
        })),
      );
    } catch (error) {
      // A failed reminder must not block deletion scheduling; it is not retried (claimed above).
      this.logger.error(`retention notice push failed for user ${userId}`, stackFrames(error));
    }
  }
}
