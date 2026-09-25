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

maybeDescribe('pipeline control edge cases (e2e)', () => {
  let e2e: E2eApp;
  let owner: { id: string; token: string };

  beforeAll(async () => {
    e2e = await startE2eApp();
    owner = await e2e.createUser();
  });
  afterAll(async () => e2e?.close());
  jest.setTimeout(60_000);

  const create = async (body: object = NEW_MEETING) =>
    (await e2e.http('POST', '/meetings', owner.token, body)).body.id as string;

  const waitUntil = async <T>(read: () => Promise<T>, done: (v: T) => boolean): Promise<T> => {
    const deadline = Date.now() + 15_000;
    for (;;) {
      const v = await read();
      if (done(v)) return v;
      if (Date.now() > deadline) throw new Error(`timeout: ${JSON.stringify(v)}`);
      await new Promise((r) => setTimeout(r, 50));
    }
  };

  it('reindex full on a ready meeting resets all steps to pending', async () => {
    const id = await create();
    await e2e.http('POST', `/meetings/${id}/segments/bulk`, owner.token, {
      segments: [seg(1)],
    });
    await e2e.http('POST', `/meetings/${id}/end`, owner.token, { last_seq: 1 });
    await waitUntil(
      async () => (await e2e.db.query('SELECT status FROM meetings WHERE id = $1', [id])).rows[0],
      (m) => m.status === 'processing',
    );

    // Manually set meeting to ready and mark all steps as succeeded
    await e2e.db.query('UPDATE meetings SET status = $2, pipeline_run = 1 WHERE id = $1', [id, 'ready']);
    await e2e.db.query(
      `UPDATE processing_jobs SET status = 'succeeded', finished_at = now() WHERE meeting_id = $1`,
      [id],
    );

    // Reindex full should reset everything to queued (then worker will move to processing)
    const res = await e2e.http('POST', `/meetings/${id}/reindex`, owner.token, { scope: 'full' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('queued');

    // Verify pipeline_run was incremented
    const meeting = (await e2e.db.query('SELECT pipeline_run FROM meetings WHERE id = $1', [id])).rows[0];
    expect(meeting.pipeline_run).toBe(2);

    // Verify all steps are now pending (newly created for the new run)
    const steps = (
      await e2e.db.query('SELECT status FROM processing_jobs WHERE meeting_id = $1 ORDER BY step', [id])
    ).rows;
    expect(steps.length).toBeGreaterThan(0);
    for (const step of steps) {
      expect(step.status).toBe('pending');
    }
  });

  it('reindex while processing returns 409 INVALID_STATE_TRANSITION', async () => {
    const id = await create();
    await e2e.http('POST', `/meetings/${id}/segments/bulk`, owner.token, {
      segments: [seg(1)],
    });
    await e2e.http('POST', `/meetings/${id}/end`, owner.token, { last_seq: 1 });
    await waitUntil(
      async () => (await e2e.db.query('SELECT status FROM meetings WHERE id = $1', [id])).rows[0],
      (m) => m.status === 'processing',
    );

    const res = await e2e.http('POST', `/meetings/${id}/reindex`, owner.token, { scope: 'full' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_STATE_TRANSITION');
  });

  it('PATCH segment on a queued meeting succeeds', async () => {
    const id = await create();
    await e2e.http('POST', `/meetings/${id}/segments/bulk`, owner.token, {
      segments: [seg(1), seg(2)],
    });

    // Get a segment ID before ending (while still recording)
    const segmentId = (
      await e2e.db.query('SELECT id FROM transcript_segments WHERE meeting_id = $1 AND seq = 1', [id])
    ).rows[0].id;

    // Manually set the meeting to queued state (without the race of worker picking it up)
    await e2e.db.query('UPDATE meetings SET status = $2, ended_at = now() WHERE id = $1', [id, 'queued']);

    // Now try to patch the segment - should succeed since queued is editable
    const res = await e2e.http('PATCH', `/segments/${segmentId}`, owner.token, { text: 'sửa' });
    expect(res.status).toBe(200);
    expect(res.body.text).toBe('sửa');
  });

  it('status endpoint for a ready meeting has current_step null', async () => {
    const id = await create();
    await e2e.http('POST', `/meetings/${id}/segments/bulk`, owner.token, {
      segments: [seg(1)],
    });
    await e2e.http('POST', `/meetings/${id}/end`, owner.token, { last_seq: 1 });

    // Set meeting to ready manually (simulating completion)
    await e2e.db.query('UPDATE meetings SET status = $2 WHERE id = $1', [id, 'ready']);

    const res = await e2e.http('GET', `/meetings/${id}/status`, owner.token);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ready');
    expect(res.body.current_step).toBeNull();
  });
});
