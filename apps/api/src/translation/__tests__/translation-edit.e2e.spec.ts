import { jest } from '@jest/globals';
import { hasInfra, startE2eApp, type E2eApp } from '../../test-support/e2e-app.js';

const maybeDescribe = hasInfra ? describe : describe.skip;
const base = { source_language: 'vi-VN', audio_source: 'device_mic', recording_quality: 'standard' };

const fakeTranslator = (prompt: string): string =>
  JSON.stringify((JSON.parse(prompt) as { seq: number; text: string }[]).map((i) => ({ seq: i.seq, text: `EN ${i.text}` })));

maybeDescribe('translation: edits, settings changes, input bounds (e2e)', () => {
  jest.setTimeout(60_000);
  let e2e: E2eApp;
  let owner: { id: string; token: string };

  beforeAll(async () => {
    e2e = await startE2eApp({ TRANSLATION_BATCH_WINDOW_MS: '200' });
    owner = await e2e.createUser();
  });
  beforeEach(() => {
    e2e.gemini.calls.length = 0;
    e2e.gemini.generate = fakeTranslator;
  });
  afterAll(async () => e2e?.close());

  const generateCalls = () => e2e.gemini.calls.filter((c) => c.method === 'generateContent').length;
  const meeting = async (translate_to: string | null) => (await e2e.http('POST', '/meetings', owner.token, { ...base, translate_to })).body.id as string;
  const bulk = (id: string, segments: [number, string][]) =>
    e2e.http('POST', `/meetings/${id}/segments/bulk`, owner.token, {
      segments: segments.map(([seq, text]) => ({ seq, text, started_at_ms: seq * 1000, ended_at_ms: seq * 1000 + 500 })),
    });
  const row = async (id: string, seq: number) =>
    (await e2e.db.query('SELECT id, text, translated_text, translated_to FROM transcript_segments WHERE meeting_id = $1 AND seq = $2', [id, seq])).rows[0] as {
      id: string;
      text: string;
      translated_text: string | null;
      translated_to: string | null;
    };
  const until = async <T>(read: () => Promise<T>, done: (v: T) => boolean, ms = 8000): Promise<T> => {
    const deadline = Date.now() + ms;
    for (;;) {
      const value = await read();
      if (done(value) || Date.now() > deadline) return value;
      await new Promise((r) => setTimeout(r, 50));
    }
  };
  /** Corrections need a finished meeting; flipping the status directly keeps the pipeline (and its model calls) out of it. */
  const edit = async (id: string, segmentId: string, text: string) => {
    await e2e.db.query("UPDATE meetings SET status = 'ready' WHERE id = $1", [id]);
    return e2e.http('PATCH', `/segments/${segmentId}`, owner.token, { text });
  };

  it('editing a segment clears the stale translation and translates the new text', async () => {
    const id = await meeting('en-US');
    await bulk(id, [[1, 'câu gốc']]);
    await until(() => row(id, 1), (r) => r.translated_text !== null);
    expect((await row(id, 1)).translated_text).toBe('EN câu gốc');

    const edited = await edit(id, (await row(id, 1)).id, 'câu đã sửa');
    expect(edited.status).toBe(200);
    // The response already shows no translation: the old one described the old text.
    expect(edited.body).toMatchObject({ text: 'câu đã sửa', translated_text: null, translated_to: null });

    const after = await until(() => row(id, 1), (r) => r.translated_text !== null);
    expect(after).toMatchObject({ text: 'câu đã sửa', translated_text: 'EN câu đã sửa', translated_to: 'en-US' });
  });

  it('editing a segment of a meeting without translation neither calls the model nor leaves a translation', async () => {
    const id = await meeting(null);
    await bulk(id, [[1, 'x']]);
    const edited = await edit(id, (await row(id, 1)).id, 'y');
    expect(edited.body).toMatchObject({ translated_text: null });
    await new Promise((r) => setTimeout(r, 500));
    expect(generateCalls()).toBe(0);
  });

  it('turning translation on mid-meeting applies to the very next segment (settings cache is dropped)', async () => {
    const id = await meeting(null);
    await bulk(id, [[1, 'trước']]);
    await new Promise((r) => setTimeout(r, 400));
    expect(generateCalls()).toBe(0);
    expect((await e2e.http('PATCH', `/meetings/${id}`, owner.token, { translate_to: 'en-US' })).status).toBe(200);
    await bulk(id, [[2, 'sau']]);
    const after = await until(() => row(id, 2), (r) => r.translated_text !== null);
    expect(after.translated_text).toBe('EN sau');
    expect((await row(id, 1)).translated_text).toBeNull();
  });

  it('a stale translation for another language is re-translated by the retry endpoint', async () => {
    const id = await meeting('en-US');
    await bulk(id, [[1, 'chào']]);
    await until(() => row(id, 1), (r) => r.translated_text !== null);
    await e2e.db.query("UPDATE transcript_segments SET translated_to = 'fr-FR', translated_text = 'bonjour' WHERE meeting_id = $1", [id]);
    const res = await e2e.http('POST', `/meetings/${id}/segments/1/translate`, owner.token);
    expect(res).toMatchObject({ status: 200, body: { seq: 1, translated_text: 'EN chào', translated_to: 'en-US' } });
  });

  it('seq outside int4 (or negative) is a 404, never a 500', async () => {
    const id = await meeting('en-US');
    for (const seq of ['2147483648', '99999999999999999999', '-1']) {
      expect((await e2e.http('POST', `/meetings/${id}/segments/${seq}/translate`, owner.token)).status).toBe(404);
    }
    expect((await e2e.http('POST', `/meetings/${id}/segments/2147483647/translate`, owner.token)).status).toBe(404);
  });
});
