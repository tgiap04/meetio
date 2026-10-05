import { jest } from '@jest/globals';
import { hasInfra, startE2eApp, type E2eApp } from '../../test-support/e2e-app.js';

const maybeDescribe = hasInfra ? describe : describe.skip;
const base = { source_language: 'vi-VN', audio_source: 'device_mic', recording_quality: 'standard' };
const SECRET = 'bản dịch bí mật cần không lọt vào log';

maybeDescribe('PUT /meetings/:id/segments/:seq/translation (e2e)', () => {
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

  const meeting = async (translate_to: string | null) => (await e2e.http('POST', '/meetings', owner.token, { ...base, translate_to })).body.id as string;
  const ingest = (id: string, seq: number, text = `câu ${seq}`) =>
    e2e.http('POST', `/meetings/${id}/segments/bulk`, owner.token, {
      segments: [{ seq, text, started_at_ms: seq * 1000, ended_at_ms: seq * 1000 + 500 }],
    });
  const put = (id: string, seq: number | string, body: unknown, token = owner.token) => e2e.http('PUT', `/meetings/${id}/segments/${seq}/translation`, token, body);
  const stored = async (id: string, seq: number) =>
    (await e2e.db.query('SELECT translated_text, translated_to FROM transcript_segments WHERE meeting_id = $1 AND seq = $2', [id, seq])).rows[0] as {
      translated_text: string | null;
      translated_to: string | null;
    };

  it('stores the translation (204), shows it in GET segments, and overwrites idempotently', async () => {
    const id = await meeting('en-US');
    await ingest(id, 1);
    expect((await put(id, 1, { translated_text: 'hello', translated_to: 'en-US' })).status).toBe(204);
    expect((await put(id, 1, { translated_text: 'hello', translated_to: 'en-US' })).status).toBe(204);
    const list = await e2e.http('GET', `/meetings/${id}/segments`, owner.token);
    expect(list.body.items[0]).toMatchObject({ seq: 1, translated_text: 'hello', translated_to: 'en-US' });
    expect((await put(id, 1, { translated_text: 'hi there', translated_to: 'en-US' })).status).toBe(204);
    expect(await stored(id, 1)).toEqual({ translated_text: 'hi there', translated_to: 'en-US' });
  });

  it('is accepted whatever the meeting status', async () => {
    const id = await meeting('en-US');
    await ingest(id, 1);
    await e2e.db.query("UPDATE meetings SET status = 'ready' WHERE id = $1", [id]);
    expect((await put(id, 1, { translated_text: 'late', translated_to: 'en-US' })).status).toBe(204);
  });

  it('404 for a stranger, a deleted meeting, a bad id, a missing segment and a bad seq', async () => {
    const id = await meeting('en-US');
    await ingest(id, 1);
    const body = { translated_text: 'x', translated_to: 'en-US' };
    expect((await put(id, 1, body, stranger.token)).status).toBe(404);
    expect((await put('not-a-uuid', 1, body)).status).toBe(404);
    expect((await put(id, 2, body)).status).toBe(404);
    for (const seq of ['abc', '-1', '2147483648', '99999999999999999999']) {
      expect((await put(id, seq, body)).status).toBe(404);
    }
    expect((await put(id, 2147483647, body)).status).toBe(404);
    expect((await stored(id, 1)).translated_text).toBeNull();
    await e2e.db.query('UPDATE meetings SET deleted_at = now() WHERE id = $1', [id]);
    expect((await put(id, 1, body)).status).toBe(404);
  });

  it('400 VALIDATION_ERROR for a wrong language, translation off, and a bad body', async () => {
    const on = await meeting('en-US');
    const off = await meeting(null);
    await ingest(on, 1);
    await ingest(off, 1);
    const wrong = await put(on, 1, { translated_text: 'x', translated_to: 'vi-VN' });
    expect(wrong).toMatchObject({ status: 400, body: { error: { code: 'VALIDATION_ERROR' } } });
    expect(await put(off, 1, { translated_text: 'x', translated_to: 'en-US' })).toMatchObject({ status: 400, body: { error: { code: 'VALIDATION_ERROR' } } });
    for (const bad of [
      {},
      { translated_text: '', translated_to: 'en-US' },
      { translated_text: ' \n\t ', translated_to: 'en-US' },
      { translated_text: 'x'.repeat(10_001), translated_to: 'en-US' },
      { translated_text: 'x', translated_to: 'fr-FR' },
      { translated_text: 5, translated_to: 'en-US' },
    ]) {
      expect(await put(on, 1, bad)).toMatchObject({ status: 400, body: { error: { code: 'VALIDATION_ERROR' } } });
    }
    expect((await stored(on, 1)).translated_text).toBeNull();
  });

  it('never writes the translated text to the server log', async () => {
    const id = await meeting('en-US');
    await ingest(id, 1);
    await put(id, 1, { translated_text: SECRET, translated_to: 'en-US' });
    await put(id, 1, { translated_text: SECRET, translated_to: 'vi-VN' });
    expect(e2e.logs()).not.toContain(SECRET);
  });

  it('editing a segment still clears its translation', async () => {
    const id = await meeting('en-US');
    await ingest(id, 1);
    await put(id, 1, { translated_text: 'hello', translated_to: 'en-US' });
    await e2e.db.query("UPDATE meetings SET status = 'ready' WHERE id = $1", [id]);
    const segmentId = (await e2e.db.query('SELECT id FROM transcript_segments WHERE meeting_id = $1 AND seq = 1', [id])).rows[0].id as string;
    const edited = await e2e.http('PATCH', `/segments/${segmentId}`, owner.token, { text: 'câu đã sửa' });
    expect(edited.status).toBe(200);
    expect(edited.body).toMatchObject({ translated_text: null, translated_to: null });
    expect(await stored(id, 1)).toEqual({ translated_text: null, translated_to: null });
  });
});
