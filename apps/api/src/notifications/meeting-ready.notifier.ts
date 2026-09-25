import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource } from 'typeorm';
import { NotificationSetting, type MeetingReadyPushData } from '@meetio/shared';
import { ExpoPushClient } from './expo-push.client.js';

/**
 * The "your meeting is ready" push (US-30).
 *
 * - Exactly once per meeting: `ready_notified_at` is claimed with a single
 *   conditional UPDATE, so retries, re-runs and concurrent workers cannot send twice.
 * - The text is generic on purpose: push payloads pass through Expo, Apple and
 *   Google servers, and meeting content is personal data (NFR-01). Only the
 *   meeting id travels, for the tap to open the right screen.
 * - Honours `notification_settings.meeting_ready_push` (missing = on).
 * - Never throws: a push failure must not fail the pipeline that just succeeded.
 */
@Injectable()
export class MeetingReadyNotifier {
  private readonly logger = new Logger(MeetingReadyNotifier.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly expo: ExpoPushClient,
  ) {}

  async notify(meetingId: string): Promise<void> {
    try {
      const [claimed] = (await this.dataSource.query(
        `UPDATE meetings m SET ready_notified_at = now()
         FROM users u
         WHERE m.id = $1 AND m.ready_notified_at IS NULL AND u.id = m.user_id
         RETURNING m.user_id, u.notification_settings`,
        [meetingId],
      )) as [{ user_id: string; notification_settings: Record<string, unknown> }[], number];
      const row = claimed[0];
      if (!row || row.notification_settings?.[NotificationSetting.MEETING_READY_PUSH] === false) {
        return;
      }
      const tokens = (await this.dataSource.query('SELECT token FROM push_tokens WHERE user_id = $1', [row.user_id])) as {
        token: string;
      }[];
      if (tokens.length === 0) return;

      const data: MeetingReadyPushData = { type: 'meeting_ready', meeting_id: meetingId };
      const tickets = await this.expo.send(
        tokens.map(({ token }) => ({
          to: token,
          title: 'Cuộc họp đã xử lý xong',
          body: 'Tóm tắt và việc cần làm đã sẵn sàng.',
          data: { ...data },
          sound: 'default' as const,
        })),
      );
      const gone = tokens.filter((_, i) => {
        const ticket = tickets[i];
        return ticket?.status === 'error' && ticket.details?.error === 'DeviceNotRegistered';
      });
      if (gone.length > 0) {
        await this.dataSource.query('DELETE FROM push_tokens WHERE token = ANY($1::text[])', [gone.map((t) => t.token)]);
      }
    } catch (error) {
      this.logger.error(`Meeting-ready push failed for ${meetingId}`, error instanceof Error ? error.stack : undefined);
    }
  }
}
