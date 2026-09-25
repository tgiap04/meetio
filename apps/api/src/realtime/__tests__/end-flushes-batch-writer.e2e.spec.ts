import { jest } from '@jest/globals';
import { hasInfra, startE2eApp, type E2eApp } from '../../test-support/e2e-app.js';
import { WsTestClient } from './ws-test-client.js';

const maybeDescribe = hasInfra ? describe : describe.skip;

/**
 * `end` must see segments that are still sitting in the WebSocket batch
 * writer's buffer. A 5-second window makes that state deterministic: the
 * segments are received but neither written nor acked when `end` arrives, so
 * the only way `end` can succeed is by flushing them first.
 */
maybeDescribe('end flushes the WebSocket batch writer (e2e)', () => {
  jest.setTimeout(60_000);
  let e2e: E2eApp;
  let owner: { id: string; token: string };

  beforeAll(async () => {
    e2e = await startE2eApp({ SEGMENT_BATCH_WINDOW_MS: '5000' });
    owner = await e2e.createUser();
  });
  afterAll(async () => e2e?.close());

  it('writes buffered segments before checking last_seq, then acks them', async () => {
    const meetingId = (
      await e2e.http('POST', '/meetings', owner.token, {
        source_language: 'vi-VN',
        audio_source: 'device_mic',
        recording_quality: 'standard',
      })
    ).body.id as string;
    const client = await WsTestClient.connect(e2e.baseUrl, owner.token);
    try {
      await client.join(meetingId);
      [1, 2, 3].forEach((seq) => client.send(seq));
      await new Promise((r) => setTimeout(r, 500)); // received, validated, buffered — not yet written

      const before = await e2e.db.query(
        'SELECT count(*)::int AS n FROM transcript_segments WHERE meeting_id = $1',
        [meetingId],
      );
      expect(before.rows[0].n).toBe(0);
      expect(client.replies).toEqual([]);

      const started = Date.now();
      const ended = await e2e.http('POST', `/meetings/${meetingId}/end`, owner.token, {
        last_seq: 3,
      });
      expect(ended.status).toBe(200);
      expect(ended.body.status).toBe('queued');
      expect(Date.now() - started).toBeLessThan(4000); // did not just wait out the window

      const replies = await client.waitForReplies(3);
      expect(replies.map((r) => [r.event, r.seq]).sort()).toEqual([
        ['segment_ack', 1],
        ['segment_ack', 2],
        ['segment_ack', 3],
      ]);
    } finally {
      client.close();
    }
  });
});
