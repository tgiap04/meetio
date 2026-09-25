import { jest } from '@jest/globals';
import { hasInfra, startE2eApp, type E2eApp } from '../../test-support/e2e-app.js';

const maybeDescribe = hasInfra ? describe : describe.skip;
const NEW_MEETING = {
  source_language: 'vi-VN',
  audio_source: 'device_mic',
  recording_quality: 'standard',
};
const seg = (seq: number) => ({
  seq,
  text: `đoạn ${seq}`,
  started_at_ms: seq * 1000,
  ended_at_ms: seq * 1000 + 900,
});

maybeDescribe('delete meeting while processing (e2e)', () => {
  let e2e: E2eApp;
  let owner: { id: string; token: string };

  beforeAll(async () => {
    e2e = await startE2eApp();
    owner = await e2e.createUser();
  });
  afterAll(async () => e2e?.close());
  jest.setTimeout(60_000);

  const create = async () => (await e2e.http('POST', '/meetings', owner.token, NEW_MEETING)).body.id as string;

  const waitUntil = async <T>(read: () => Promise<T>, done: (v: T) => boolean): Promise<T> => {
    const deadline = Date.now() + 15_000;
    for (;;) {
      const v = await read();
      if (done(v)) return v;
      if (Date.now() > deadline) throw new Error(`timeout: ${JSON.stringify(v)}`);
      await new Promise((r) => setTimeout(r, 50));
    }
  };

  it('deleted meeting mid-run leaves no orphan processing_jobs', async () => {
    const id = await create();
    await e2e.http('POST', `/meetings/${id}/segments/bulk`, owner.token, {
      segments: [seg(1)],
    });
    await e2e.http('POST', `/meetings/${id}/end`, owner.token, { last_seq: 1 });

    // Wait for meeting to transition to processing
    await waitUntil(
      async () => (await e2e.db.query('SELECT status FROM meetings WHERE id = $1', [id])).rows[0],
      (m) => m.status === 'processing',
    );

    // Verify there are processing_jobs
    const jobsBefore = await e2e.db.query('SELECT COUNT(*)::int as n FROM processing_jobs WHERE meeting_id = $1', [id]);
    expect(jobsBefore.rows[0].n).toBeGreaterThan(0);

    // Delete the meeting
    const deleteRes = await e2e.http('DELETE', `/meetings/${id}`, owner.token);
    expect(deleteRes.status).toBe(204);

    // Verify meeting is hard-deleted
    const meetingCheck = await e2e.db.query('SELECT id FROM meetings WHERE id = $1', [id]);
    expect(meetingCheck.rows.length).toBe(0);

    // Verify no orphan processing_jobs remain
    const jobsAfter = await e2e.db.query('SELECT COUNT(*)::int as n FROM processing_jobs WHERE meeting_id = $1', [id]);
    expect(jobsAfter.rows[0].n).toBe(0);
  });
});
