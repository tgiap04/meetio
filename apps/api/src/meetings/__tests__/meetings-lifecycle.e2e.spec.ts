import { jest } from '@jest/globals';
import { hasInfra, startE2eApp, type E2eApp } from '../../test-support/e2e-app.js';

const maybeDescribe = hasInfra ? describe : describe.skip;
const NEW_MEETING = {
  source_language: 'vi-VN',
  audio_source: 'device_mic',
  recording_quality: 'standard',
};
const seg = (seq: number, text = `đoạn ${seq}`) => ({
  seq,
  text,
  started_at_ms: seq * 1000,
  ended_at_ms: seq * 1000 + 900,
});

maybeDescribe('meeting lifecycle (e2e, real Postgres + Redis)', () => {
  let e2e: E2eApp;
  let owner: { id: string; token: string };
  let stranger: { id: string; token: string };

  beforeAll(async () => {
    e2e = await startE2eApp();
    owner = await e2e.createUser();
    stranger = await e2e.createUser();
  });
  afterAll(async () => e2e?.close());
  jest.setTimeout(60_000);

  const create = async (body: object = NEW_MEETING) =>
    (await e2e.http('POST', '/meetings', owner.token, body)).body.id as string;

  it('creates the meeting at start, recording, with a generated title', async () => {
    const res = await e2e.http('POST', '/meetings', owner.token, NEW_MEETING);
    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: expect.any(String),
      status: 'recording',
      started_at: expect.any(String),
    });
    const detail = await e2e.http('GET', `/meetings/${res.body.id}`, owner.token);
    expect(detail.body.title).toMatch(/^Cuộc họp \d{2}\/\d{2} \d{2}:\d{2}$/);
    expect(detail.body).toMatchObject({
      audio_source: 'device_mic',
      recording_quality: 'standard',
      translate_to: null,
    });
  });

  it.each([
    ['bad language tag', { ...NEW_MEETING, source_language: 'vi VN' }],
    ['unknown audio source', { ...NEW_MEETING, audio_source: 'usb' }],
    ['missing recording quality', { source_language: 'vi-VN', audio_source: 'device_mic' }],
  ])('rejects %s with 400 VALIDATION_ERROR', async (_, body) => {
    const res = await e2e.http('POST', '/meetings', owner.token, body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it("answers someone else's meeting, a malformed id and a missing one identically: 404 MEETING_NOT_FOUND", async () => {
    const id = await create();
    for (const [path, token] of [
      [`/meetings/${id}`, stranger.token],
      ['/meetings/not-a-uuid', owner.token],
      ['/meetings/00000000-0000-4000-8000-000000000000', owner.token],
    ]) {
      const res = await e2e.http('GET', path, token);
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('MEETING_NOT_FOUND');
    }
    expect((await e2e.http('POST', `/meetings/${id}/end`, stranger.token, {})).status).toBe(404);
  });

  it('rejects illegal moves with 409 INVALID_STATE_TRANSITION', async () => {
    const id = await create();
    expect((await e2e.http('POST', `/meetings/${id}/resume`, owner.token)).body.error.code).toBe(
      'INVALID_STATE_TRANSITION',
    );
    expect((await e2e.http('POST', `/meetings/${id}/pause`, owner.token)).status).toBe(200);
    const again = await e2e.http('POST', `/meetings/${id}/pause`, owner.token);
    expect(again.status).toBe(409);
    expect(again.body.error).toMatchObject({
      code: 'INVALID_STATE_TRANSITION',
      details: { from: 'paused', action: 'pause' },
    });
  });

  it('excludes paused time from duration_sec (US-09)', async () => {
    const id = await create();
    await e2e.db.query(
      `UPDATE meetings SET started_at = now() - interval '600 seconds' WHERE id = $1`,
      [id],
    );
    await e2e.http('POST', `/meetings/${id}/pause`, owner.token);
    await e2e.db.query(
      `UPDATE meetings SET paused_at = now() - interval '100 seconds' WHERE id = $1`,
      [id],
    );
    await e2e.http('POST', `/meetings/${id}/resume`, owner.token);
    const ended = await e2e.http('POST', `/meetings/${id}/end`, owner.token, {});
    expect(ended.body.duration_sec).toBeGreaterThanOrEqual(499);
    expect(ended.body.duration_sec).toBeLessThanOrEqual(502);
  });

  it('refuses end while seqs are missing, names them, then ends and queues the pipeline', async () => {
    const id = await create();
    await e2e.http('POST', `/meetings/${id}/segments/bulk`, owner.token, {
      segments: [seg(1), seg(2), seg(4)],
    });

    const pending = await e2e.http('POST', `/meetings/${id}/end`, owner.token, { last_seq: 5 });
    expect(pending.status).toBe(409);
    expect(pending.body.error).toMatchObject({
      code: 'SEGMENTS_PENDING',
      details: { missing_count: 2, missing_seqs: [3, 5] },
    });
    expect((await e2e.http('GET', `/meetings/${id}`, owner.token)).body.status).toBe('recording');

    await e2e.http('POST', `/meetings/${id}/segments/bulk`, owner.token, {
      segments: [seg(3), seg(5)],
    });
    const ended = await e2e.http('POST', `/meetings/${id}/end`, owner.token, { last_seq: 5 });
    expect(ended.status).toBe(200);
    expect(ended.body.status).toBe('queued');

    const job = await e2e.processingQueue.getJob(id);
    expect(job?.data).toEqual({ meeting_id: id });

    const second = await e2e.http('POST', `/meetings/${id}/end`, owner.token, { last_seq: 5 });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('INVALID_STATE_TRANSITION');
  });

  it('serialises concurrent end calls: exactly one wins', async () => {
    const id = await create();
    const results = await Promise.all(
      [1, 2, 3].map(() => e2e.http('POST', `/meetings/${id}/end`, owner.token, {})),
    );
    expect(results.map((r) => r.status).sort()).toEqual([200, 409, 409]);
  });

  it('bulk upsert is idempotent and never overwrites the first copy', async () => {
    const id = await create();
    const tenCopies = Array.from({ length: 10 }, () => seg(1));
    expect(
      (
        await e2e.http('POST', `/meetings/${id}/segments/bulk`, owner.token, {
          segments: tenCopies,
        })
      ).body,
    ).toEqual({ acked_seqs: [1] });
    await e2e.http('POST', `/meetings/${id}/segments/bulk`, owner.token, {
      segments: [seg(1, 'bản gửi lại khác')],
    });
    const { rows } = await e2e.db.query(
      'SELECT text FROM transcript_segments WHERE meeting_id = $1',
      [id],
    );
    expect(rows).toEqual([{ text: 'đoạn 1' }]);
  });

  it('bulk validates cross-field rules and refuses segments once processing has started', async () => {
    const id = await create();
    const bad = await e2e.http('POST', `/meetings/${id}/segments/bulk`, owner.token, {
      segments: [{ ...seg(1), ended_at_ms: 10 }],
    });
    expect(bad.status).toBe(400);
    await e2e.db.query(`UPDATE meetings SET status = 'processing' WHERE id = $1`, [id]);
    const late = await e2e.http('POST', `/meetings/${id}/segments/bulk`, owner.token, {
      segments: [seg(1)],
    });
    expect(late.status).toBe(409);
    expect(late.body.error.code).toBe('INVALID_STATE_TRANSITION');
  });

  it('still accepts late segments after end, until processing starts', async () => {
    const id = await create();
    await e2e.http('POST', `/meetings/${id}/end`, owner.token, {});
    const res = await e2e.http('POST', `/meetings/${id}/segments/bulk`, owner.token, {
      segments: [seg(1)],
    });
    expect(res.status).toBe(200);
  });
});
