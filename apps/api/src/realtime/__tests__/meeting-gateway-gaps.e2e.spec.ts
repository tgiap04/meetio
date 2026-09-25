import { jest } from '@jest/globals';
import { hasInfra, startE2eApp, type E2eApp } from '../../test-support/e2e-app.js';
import { WsTestClient } from './ws-test-client.js';

const maybeDescribe = hasInfra ? describe : describe.skip;
const NEW_MEETING = {
  source_language: 'vi-VN',
  audio_source: 'device_mic',
  recording_quality: 'standard',
};

maybeDescribe('/meeting-room gateway gaps (e2e)', () => {
  jest.setTimeout(60_000);
  let e2e: E2eApp;
  let owner: { id: string; token: string };
  const clients: WsTestClient[] = [];

  beforeAll(async () => {
    e2e = await startE2eApp();
    owner = await e2e.createUser();
  });
  afterEach(() => clients.splice(0).forEach((c) => c.close()));
  afterAll(async () => e2e?.close());

  const connect = async (token = owner.token) => {
    const client = await WsTestClient.connect(e2e.baseUrl, token);
    clients.push(client);
    return client;
  };
  const newMeeting = async () =>
    (await e2e.http('POST', '/meetings', owner.token, NEW_MEETING)).body.id as string;
  const segmentRows = async (meetingId: string) =>
    (
      await e2e.db.query(
        'SELECT seq, text FROM transcript_segments WHERE meeting_id = $1 ORDER BY seq',
        [meetingId],
      )
    ).rows;

  it('rejects join with non-UUID meeting_id as MEETING_NOT_FOUND', async () => {
    const client = await connect();
    const result = await client.join('not-a-uuid');
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('MEETING_NOT_FOUND');
  });

  it('rejects join with non-existent meeting', async () => {
    const client = await connect();
    const result = await client.join('00000000-0000-4000-8000-000000000001');
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('MEETING_NOT_FOUND');
  });

  it('allows multiple sockets in the same meeting to write independently', async () => {
    const meetingId = await newMeeting();
    const client1 = await connect();
    const client2 = await connect();

    expect(await client1.join(meetingId)).toEqual({ ok: true });
    expect(await client2.join(meetingId)).toEqual({ ok: true });

    client1.send(1, 'từ socket 1');
    client2.send(2, 'từ socket 2');

    await client1.waitForReplies(1);
    await client2.waitForReplies(1);

    const rows = await segmentRows(meetingId);
    expect(rows).toHaveLength(2);
    expect(rows.map((r: { seq: number }) => r.seq)).toEqual([1, 2]);
  });

  it('refuses segments sent after the meeting was deleted, and leaves no rows behind', async () => {
    const meetingId = await newMeeting();
    const client = await connect();
    await client.join(meetingId);

    client.send(1);
    await client.waitForReplies(1);

    // DELETE has committed once it returns: nothing sent afterwards can land.
    expect((await e2e.http('DELETE', `/meetings/${meetingId}`, owner.token)).status).toBe(204);

    client.send(2);
    const replies = await client.waitForReplies(2);
    expect(replies[1]).toMatchObject({ event: 'segment_error', seq: 2, code: 'MEETING_NOT_FOUND' });
    const { rows } = await e2e.db.query(
      'SELECT count(*)::int AS n FROM transcript_segments WHERE meeting_id = $1',
      [meetingId],
    );
    expect(rows[0].n).toBe(0);
  });

  it('rejects segments after meeting status moves to processing', async () => {
    const meetingId = await newMeeting();
    const client = await connect();
    await client.join(meetingId);

    client.send(1);
    await client.waitForReplies(1);

    await e2e.db.query(`UPDATE meetings SET status = 'processing' WHERE id = $1`, [meetingId]);

    client.send(2);
    const replies = await client.waitForReplies(2);
    // The second segment should be rejected
    expect(replies[1]).toMatchObject({ event: 'segment_error', code: 'INVALID_STATE_TRANSITION' });
  });

  it('websocket continues working for other meetings when one is deleted', async () => {
    const meeting1 = await newMeeting();
    const meeting2 = await newMeeting();

    const client = await connect();
    await client.join(meeting1);

    client.send(1);
    await client.waitForReplies(1);

    await e2e.http('DELETE', `/meetings/${meeting1}`, owner.token);

    await client.join(meeting2);
    client.send(1);
    await client.waitForReplies(2);

    expect(await segmentRows(meeting2)).toHaveLength(1);
  });
});
