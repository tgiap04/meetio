import { jest } from '@jest/globals';
import { hasInfra, startE2eApp, type E2eApp } from '../../test-support/e2e-app.js';

const maybeDescribe = hasInfra ? describe : describe.skip;
const NEW_MEETING = { source_language: 'vi-VN', audio_source: 'device_mic', recording_quality: 'standard' };
const seg = (seq: number) => ({ seq, text: `đoạn ${seq}`, started_at_ms: seq * 1000, ended_at_ms: seq * 1000 + 900, ...(seq === 3 ? { gap_before_ms: 1500 } : {}) });

maybeDescribe('transcript read and edit (e2e)', () => {
  jest.setTimeout(60_000);
  let e2e: E2eApp;
  let owner: { id: string; token: string };
  let stranger: { id: string; token: string };

  beforeAll(async () => {
    e2e = await startE2eApp();
    owner = await e2e.createUser();
    stranger = await e2e.createUser();
  });
  afterAll(async () => e2e?.close());

  async function meetingWith(count: number, status?: string) {
    const id = (await e2e.http('POST', '/meetings', owner.token, NEW_MEETING)).body.id as string;
    if (count > 0) {
      await e2e.http('POST', `/meetings/${id}/segments/bulk`, owner.token, { segments: Array.from({ length: count }, (_, i) => seg(i + 1)) });
    }
    if (status) await e2e.db.query('UPDATE meetings SET status = $2 WHERE id = $1', [id, status]);
    return id;
  }
  const segmentId = async (meetingId: string, seq: number) =>
    (await e2e.db.query('SELECT id FROM transcript_segments WHERE meeting_id = $1 AND seq = $2', [meetingId, seq])).rows[0].id as string;

  it('pages by seq without gaps or duplicates and shows restart gaps', async () => {
    const id = await meetingWith(7, 'ready');
    const seen: number[] = [];
    let from: number | null = 1;
    while (from !== null) {
      const res = await e2e.http('GET', `/meetings/${id}/segments?from_seq=${from}&limit=3`, owner.token);
      expect(res.status).toBe(200);
      seen.push(...res.body.items.map((s: { seq: number }) => s.seq));
      from = res.body.next_from_seq;
    }
    expect(seen).toEqual([1, 2, 3, 4, 5, 6, 7]);
    const first = await e2e.http('GET', `/meetings/${id}/segments?limit=3`, owner.token);
    expect(first.body.items[2]).toMatchObject({ seq: 3, gap_before_ms: 1500, is_edited: false });
    expect(first.body.items[0]).not.toHaveProperty('speaker_label');
  });

  it("hides someone else's transcript and segment", async () => {
    const id = await meetingWith(1, 'ready');
    expect((await e2e.http('GET', `/meetings/${id}/segments`, stranger.token)).status).toBe(404);
    const patch = await e2e.http('PATCH', `/segments/${await segmentId(id, 1)}`, stranger.token, { text: 'x' });
    expect(patch.status).toBe(404);
    expect((await e2e.http('PATCH', '/segments/not-a-uuid', owner.token, { text: 'x' })).status).toBe(404);
  });

  it('edits a segment on a ready meeting, marks it, and flags the summary as out of date', async () => {
    const id = await meetingWith(2, 'ready');
    await e2e.db.query('UPDATE meetings SET pipeline_started_at = now() - interval \'1 hour\' WHERE id = $1', [id]);
    expect((await e2e.http('GET', `/meetings/${id}`, owner.token)).body.has_unprocessed_edits).toBe(false);

    const res = await e2e.http('PATCH', `/segments/${await segmentId(id, 2)}`, owner.token, { text: '  Meetio ra mắt thứ Sáu  ' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ seq: 2, text: 'Meetio ra mắt thứ Sáu', is_edited: true });
    expect((await e2e.http('GET', `/meetings/${id}`, owner.token)).body.has_unprocessed_edits).toBe(true);
    expect((await e2e.http('GET', `/meetings/${id}/status`, owner.token)).body.has_unprocessed_edits).toBe(true);
    // editing never re-runs the pipeline by itself (US-24: the user is asked first)
    expect((await e2e.http('GET', `/meetings/${id}`, owner.token)).body.status).toBe('ready');
  });

  it.each(['recording', 'paused', 'processing'])('refuses edits while %s', async (status) => {
    const id = await meetingWith(1, status);
    const res = await e2e.http('PATCH', `/segments/${await segmentId(id, 1)}`, owner.token, { text: 'sửa' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_STATE_TRANSITION');
  });

  it('rejects a blank correction', async () => {
    const id = await meetingWith(1, 'ready');
    const res = await e2e.http('PATCH', `/segments/${await segmentId(id, 1)}`, owner.token, { text: '   ' });
    expect(res.status).toBe(400);
  });

  it('reverts an emptied title to the default time-based title (US-25)', async () => {
    const id = await meetingWith(0);
    const res = await e2e.http('PATCH', `/meetings/${id}`, owner.token, { title: '   ' });
    expect(res.status).toBe(200);
    expect(res.body.title).toMatch(/^Cuộc họp \d{2}\/\d{2} \d{2}:\d{2}$/);
  });
});
