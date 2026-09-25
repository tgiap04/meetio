import { jest } from '@jest/globals';
import { hasInfra, startE2eApp, type E2eApp } from '../../test-support/e2e-app.js';
import { WsTestClient } from './ws-test-client.js';

const maybeDescribe = hasInfra ? describe : describe.skip;
const NEW_MEETING = {
  source_language: 'vi-VN',
  audio_source: 'device_mic',
  recording_quality: 'standard',
};

maybeDescribe('/meeting-room gateway (e2e, real Postgres + Redis)', () => {
  jest.setTimeout(60_000);
  let e2e: E2eApp;
  let owner: { id: string; token: string };
  let stranger: { id: string; token: string };
  const clients: WsTestClient[] = [];

  beforeAll(async () => {
    e2e = await startE2eApp();
    owner = await e2e.createUser();
    stranger = await e2e.createUser();
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

  it('refuses the handshake without a token, with a bad token, and with an expired one', async () => {
    await expect(WsTestClient.connect(e2e.baseUrl, undefined)).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
    await expect(WsTestClient.connect(e2e.baseUrl, 'not.a.jwt')).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
    await expect(
      WsTestClient.connect(e2e.baseUrl, e2e.tokenFor(owner.id, -10)),
    ).rejects.toMatchObject({ code: 'TOKEN_EXPIRED' });
  });

  it("will not let a user join someone else's meeting", async () => {
    const meetingId = await newMeeting();
    const intruder = await connect(stranger.token);
    expect(await intruder.join(meetingId)).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'MEETING_NOT_FOUND' }),
    });
    intruder.send(1);
    expect((await intruder.waitForReplies(1))[0]).toMatchObject({
      event: 'segment_error',
      code: 'VALIDATION_ERROR',
    });
    expect(await segmentRows(meetingId)).toEqual([]);
  });

  it('acks every seq only once its row is already in PostgreSQL', async () => {
    const meetingId = await newMeeting();
    const client = await connect();
    expect(await client.join(meetingId)).toEqual({ ok: true });

    const seenAtAck: Promise<boolean>[] = [];
    client.socket.on('segment_ack', ({ seq }: { seq: number }) => {
      seenAtAck.push(
        e2e.db
          .query('SELECT 1 FROM transcript_segments WHERE meeting_id = $1 AND seq = $2', [
            meetingId,
            seq,
          ])
          .then((r) => r.rowCount === 1),
      );
    });
    for (let seq = 1; seq <= 20; seq++) client.send(seq);
    const replies = await client.waitForReplies(20);
    expect(replies.every((r) => r.event === 'segment_ack')).toBe(true);
    expect((await Promise.all(seenAtAck)).every(Boolean)).toBe(true);
  });

  it('sending the same seq 10 times yields 10 acks and exactly one row, which a later resend never changes', async () => {
    const meetingId = await newMeeting();
    const client = await connect();
    await client.join(meetingId);
    // Events on one socket are handled concurrently, so which in-flight copy is
    // persisted first is not defined — only that exactly one is, and it sticks.
    for (let i = 0; i < 10; i++) client.send(1, `bản ${i}`);
    const replies = await client.waitForReplies(10);
    expect(replies.filter((r) => r.event === 'segment_ack' && r.seq === 1)).toHaveLength(10);
    const rows = await segmentRows(meetingId);
    expect(rows).toHaveLength(1);

    client.send(1, 'bản gửi lại sau khi đã ack');
    await client.waitForReplies(11);
    expect(await segmentRows(meetingId)).toEqual(rows);
  });

  it('survives a dropped connection: resending after reconnect loses nothing and duplicates nothing', async () => {
    const meetingId = await newMeeting();
    const first = await connect();
    await first.join(meetingId);
    for (let seq = 1; seq <= 10; seq++) first.send(seq);
    await first.waitForReplies(10);
    for (let seq = 11; seq <= 15; seq++) first.send(seq);
    first.socket.disconnect(); // mid-flight: some of 11..15 may or may not have landed

    const acked = new Set(first.replies.filter((r) => r.event === 'segment_ack').map((r) => r.seq));
    const second = await connect();
    await second.join(meetingId);
    // A real client resends everything it has not seen acked, in seq order, plus new ones.
    const toSend = Array.from({ length: 20 }, (_, i) => i + 1).filter((seq) => !acked.has(seq));
    toSend.forEach((seq) => second.send(seq));
    await second.waitForReplies(toSend.length);

    expect((await segmentRows(meetingId)).map((r: { seq: number }) => r.seq)).toEqual(
      Array.from({ length: 20 }, (_, i) => i + 1),
    );
  });

  it('turns a real database failure into segment_error — never an ack, never a row (fault injection)', async () => {
    const meetingId = await newMeeting();
    await e2e.db.query(`
      CREATE OR REPLACE FUNCTION e2e_fail_segment() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.text = '__e2e_fail__' THEN RAISE EXCEPTION 'injected failure'; END IF; RETURN NEW; END $$;
      DROP TRIGGER IF EXISTS e2e_fail_segment ON transcript_segments;
      CREATE TRIGGER e2e_fail_segment BEFORE INSERT ON transcript_segments FOR EACH ROW EXECUTE FUNCTION e2e_fail_segment();
    `);
    try {
      const client = await connect();
      await client.join(meetingId);
      client.send(1, '__e2e_fail__');
      const [reply] = await client.waitForReplies(1);
      expect(reply).toEqual({ event: 'segment_error', seq: 1, code: 'INTERNAL_ERROR' });
      expect(await segmentRows(meetingId)).toEqual([]);

      // The client keeps it queued and retries; once the fault clears the retry is acked.
      await e2e.db.query('DROP TRIGGER e2e_fail_segment ON transcript_segments');
      client.send(1, 'đã sửa');
      expect((await client.waitForReplies(2))[1]).toEqual({ event: 'segment_ack', seq: 1 });
    } finally {
      await e2e.db.query(
        'DROP TRIGGER IF EXISTS e2e_fail_segment ON transcript_segments; DROP FUNCTION IF EXISTS e2e_fail_segment()',
      );
    }
  });

  it('refuses segments once the pipeline is processing, and after the meeting is deleted', async () => {
    const meetingId = await newMeeting();
    const client = await connect();
    await client.join(meetingId);
    await e2e.db.query(`UPDATE meetings SET status = 'processing' WHERE id = $1`, [meetingId]);
    client.send(1);
    expect((await client.waitForReplies(1))[0]).toMatchObject({
      event: 'segment_error',
      code: 'INVALID_STATE_TRANSITION',
    });

    await e2e.db.query('DELETE FROM meetings WHERE id = $1', [meetingId]);
    client.send(2);
    expect((await client.waitForReplies(2))[1]).toMatchObject({
      event: 'segment_error',
      code: 'MEETING_NOT_FOUND',
    });
  });

  it('enforces 120 transcript_segment events per minute per meeting', async () => {
    const meetingId = await newMeeting();
    const client = await connect();
    await client.join(meetingId);
    for (let seq = 1; seq <= 125; seq++) client.send(seq);
    const replies = await client.waitForReplies(125, 20_000);
    expect(replies.filter((r) => r.event === 'segment_ack')).toHaveLength(120);
    expect(replies.filter((r) => r.code === 'RATE_LIMITED')).toHaveLength(5);
  });

  it('drops a socket whose handshake token has since expired', async () => {
    const meetingId = await newMeeting();
    const client = await connect(e2e.tokenFor(owner.id, 2));
    await client.join(meetingId);
    await new Promise((r) => setTimeout(r, 2100));
    const disconnected = new Promise((r) => client.socket.once('disconnect', r));
    client.send(1);
    expect((await client.waitForReplies(1))[0]).toMatchObject({
      event: 'segment_error',
      code: 'TOKEN_EXPIRED',
    });
    await disconnected;
    expect(await segmentRows(meetingId)).toEqual([]);
  });

  it('stops writing to a meeting after leave_meeting', async () => {
    const meetingId = await newMeeting();
    const client = await connect();
    await client.join(meetingId);
    expect(await client.leave(meetingId)).toEqual({ ok: true });
    client.send(1);
    expect((await client.waitForReplies(1))[0]).toMatchObject({
      event: 'segment_error',
      code: 'VALIDATION_ERROR',
    });
  });
});
