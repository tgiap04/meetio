import { jest } from '@jest/globals';
import { hasInfra, startE2eApp, type E2eApp } from '../../test-support/e2e-app.js';
import { WsTestClient } from '../../realtime/__tests__/ws-test-client.js';

const maybeDescribe = hasInfra ? describe : describe.skip;
const base = { source_language: 'vi-VN', audio_source: 'device_mic', recording_quality: 'standard' };

interface Translated {
  meeting_id: string;
  seq: number;
  translated_text: string;
  translated_to: string;
}

/** The fake model: translates every {seq,text} to "EN <text>", but answers garbage for any prompt carrying POISON. */
const fakeTranslator = (prompt: string): string => {
  if (prompt.includes('POISON')) return 'sorry, I cannot do that';
  return JSON.stringify((JSON.parse(prompt) as { seq: number; text: string }[]).map((i) => ({ seq: i.seq, text: `EN ${i.text}` })));
};

maybeDescribe('translation (e2e, real Postgres + Redis + fake Gemini)', () => {
  jest.setTimeout(60_000);
  let e2e: E2eApp;
  let owner: { id: string; token: string };
  let stranger: { id: string; token: string };
  const clients: WsTestClient[] = [];

  beforeAll(async () => {
    e2e = await startE2eApp({ TRANSLATION_BATCH_WINDOW_MS: '300' });
    owner = await e2e.createUser();
    stranger = await e2e.createUser();
  });
  beforeEach(() => {
    e2e.gemini.calls.length = 0;
    e2e.gemini.generate = fakeTranslator;
  });
  afterEach(() => clients.splice(0).forEach((c) => c.close()));
  afterAll(async () => e2e?.close());

  const newMeeting = async (translateTo: string | null = 'en-US') =>
    (await e2e.http('POST', '/meetings', owner.token, { ...base, translate_to: translateTo })).body.id as string;
  const generateCalls = () => e2e.gemini.calls.filter((c) => c.method === 'generateContent').length;
  const rows = async (meetingId: string) =>
    (await e2e.db.query('SELECT seq, text, translated_text, translated_to FROM transcript_segments WHERE meeting_id = $1 ORDER BY seq', [meetingId])).rows as {
      seq: number;
      text: string;
      translated_text: string | null;
      translated_to: string | null;
    }[];
  const until = async <T>(read: () => Promise<T>, done: (v: T) => boolean, ms = 8000): Promise<T> => {
    const deadline = Date.now() + ms;
    for (;;) {
      const value = await read();
      if (done(value) || Date.now() > deadline) return value;
      await new Promise((r) => setTimeout(r, 50));
    }
  };
  const joined = async (meetingId: string) => {
    const client = await WsTestClient.connect(e2e.baseUrl, owner.token);
    clients.push(client);
    expect(await client.join(meetingId)).toEqual({ ok: true });
    const translated: Translated[] = [];
    const failed: { seq: number; meeting_id: string }[] = [];
    client.socket.on('segment_translated', (p: Translated) => translated.push(p));
    client.socket.on('segment_translation_failed', (p: { seq: number; meeting_id: string }) => failed.push(p));
    return { client, translated, failed };
  };

  it('translates segments sent over the socket in one batched call, stores them and pushes each seq', async () => {
    const id = await newMeeting();
    const { client, translated } = await joined(id);
    [1, 2, 3].forEach((s) => client.send(s, `câu số ${s}`));
    await client.waitForReplies(3);
    await until(async () => translated.length, (n) => n >= 3);

    expect(translated.map((t) => t.seq).sort()).toEqual([1, 2, 3]);
    expect(translated.find((t) => t.seq === 2)).toEqual({ meeting_id: id, seq: 2, translated_text: 'EN câu số 2', translated_to: 'en-US' });
    expect((await rows(id)).map((r) => [r.seq, r.translated_text, r.translated_to])).toEqual([
      [1, 'EN câu số 1', 'en-US'],
      [2, 'EN câu số 2', 'en-US'],
      [3, 'EN câu số 3', 'en-US'],
    ]);
    expect(generateCalls()).toBe(1);
    const usage = await e2e.db.query("SELECT count(*)::int AS n FROM usage_records WHERE meeting_id = $1 AND operation = 'translate'", [id]);
    expect(usage.rows[0].n).toBe(1);
    // The transcript API serves them back for the after-meeting view.
    const listed = await e2e.http('GET', `/meetings/${id}/segments`, owner.token);
    expect(listed.body.items.map((i: { translated_text: string }) => i.translated_text)).toEqual(['EN câu số 1', 'EN câu số 2', 'EN câu số 3']);
  });

  it('does not translate, nor call the model, when the meeting has translation off', async () => {
    const id = await newMeeting(null);
    const { client, translated } = await joined(id);
    client.send(1);
    await client.waitForReplies(1);
    await new Promise((r) => setTimeout(r, 900));
    expect(translated).toEqual([]);
    expect(generateCalls()).toBe(0);
    expect((await rows(id))[0].translated_text).toBeNull();
  });

  it('acks a segment without waiting for translation', async () => {
    const id = await newMeeting();
    const { client, translated } = await joined(id);
    client.send(1);
    await client.waitForReplies(1);
    // The translation window (300ms) is still open when the ack has long arrived.
    expect(translated).toEqual([]);
    // Let it finish so its model call cannot leak into the next test's count.
    await until(async () => translated.length, (n) => n >= 1);
    expect(translated).toHaveLength(1);
  });

  it('translates segments sent through POST /segments/bulk, and a resend costs no new model call', async () => {
    const id = await newMeeting();
    const body = { segments: [1, 2].map((s) => ({ seq: s, text: `bulk ${s}`, started_at_ms: s * 1000, ended_at_ms: s * 1000 + 500 })) };
    expect((await e2e.http('POST', `/meetings/${id}/segments/bulk`, owner.token, body)).status).toBe(200);
    const done = await until(() => rows(id), (r) => r.every((x) => x.translated_text));
    expect(done.map((r) => r.translated_text)).toEqual(['EN bulk 1', 'EN bulk 2']);
    expect(generateCalls()).toBe(1);

    await e2e.http('POST', `/meetings/${id}/segments/bulk`, owner.token, body);
    await new Promise((r) => setTimeout(r, 900));
    expect(generateCalls()).toBe(1);
  });

  it('isolates a failing segment: neighbours translate, the bad one is reported and can be retried by hand', async () => {
    const id = await newMeeting();
    const { client, translated, failed } = await joined(id);
    client.send(1, 'tốt một');
    client.send(2, 'POISON');
    client.send(3, 'tốt ba');
    await client.waitForReplies(3);
    await until(async () => translated.length + failed.length, (n) => n >= 3);

    expect(translated.map((t) => t.seq).sort()).toEqual([1, 3]);
    expect(failed).toEqual([{ seq: 2, meeting_id: id }]);
    expect((await rows(id)).map((r) => r.translated_text)).toEqual(['EN tốt một', null, 'EN tốt ba']);
    // One batch call (garbage answer for the whole batch) + one single call per segment.
    expect(generateCalls()).toBe(4);

    // The model recovers; the user taps "Thử lại".
    e2e.gemini.generate = (prompt) => fakeTranslator(prompt.replace('POISON', 'ổn rồi'));
    const retried = await e2e.http('POST', `/meetings/${id}/segments/2/translate`, owner.token);
    expect(retried).toMatchObject({ status: 200, body: { seq: 2, translated_text: 'EN ổn rồi', translated_to: 'en-US' } });
    expect((await rows(id))[1].translated_text).toBe('EN ổn rồi');
    const again = await e2e.http('POST', `/meetings/${id}/segments/2/translate`, owner.token);
    expect(again.body.translated_text).toBe('EN ổn rồi');
    expect(generateCalls()).toBe(5);
  });

  it('retry: 503 while the model keeps failing, 404 for strangers / unknown seq / bad ids, 400 when translation is off', async () => {
    const id = await newMeeting();
    await e2e.http('POST', `/meetings/${id}/segments/bulk`, owner.token, { segments: [{ seq: 1, text: 'POISON', started_at_ms: 0, ended_at_ms: 10 }] });
    await until(async () => generateCalls(), (n) => n >= 1);
    await new Promise((r) => setTimeout(r, 300));

    expect((await e2e.http('POST', `/meetings/${id}/segments/1/translate`, owner.token)).status).toBe(503);
    const foreign = await e2e.http('POST', `/meetings/${id}/segments/1/translate`, stranger.token);
    expect(foreign).toMatchObject({ status: 404, body: { error: { code: 'MEETING_NOT_FOUND' } } });
    expect((await e2e.http('POST', `/meetings/${id}/segments/99/translate`, owner.token)).status).toBe(404);
    expect((await e2e.http('POST', `/meetings/${id}/segments/abc/translate`, owner.token)).status).toBe(404);
    expect((await e2e.http('POST', `/meetings/not-a-uuid/segments/1/translate`, owner.token)).status).toBe(404);

    const off = await newMeeting(null);
    await e2e.http('POST', `/meetings/${off}/segments/bulk`, owner.token, { segments: [{ seq: 1, text: 'x', started_at_ms: 0, ended_at_ms: 10 }] });
    expect((await e2e.http('POST', `/meetings/${off}/segments/1/translate`, owner.token)).status).toBe(400);
    expect((await rows(id))[0].translated_text).toBeNull();
  });

  it('refuses translate_to outside vi-VN/en-US or equal to the source language, on create and on PATCH', async () => {
    for (const translate_to of ['vi-VN', 'fr-FR', 'en']) {
      const res = await e2e.http('POST', '/meetings', owner.token, { ...base, translate_to });
      expect(res).toMatchObject({ status: 400, body: { error: { code: 'VALIDATION_ERROR' } } });
    }
    const id = await newMeeting(null);
    expect((await e2e.http('PATCH', `/meetings/${id}`, owner.token, { translate_to: 'vi-VN' })).status).toBe(400);
    expect((await e2e.http('PATCH', `/meetings/${id}`, owner.token, { translate_to: 'en-US' })).body.translate_to).toBe('en-US');
  });

  it('never writes segment or translated text to the server log', async () => {
    const id = await newMeeting();
    const { client, translated } = await joined(id);
    client.send(1, 'BÍMẬT-gốc');
    client.send(2, 'POISON BÍMẬT-lỗi');
    await client.waitForReplies(2);
    await until(async () => translated.length, (n) => n >= 1);
    await new Promise((r) => setTimeout(r, 500));
    expect(e2e.logs()).toContain('Translat');
    expect(e2e.logs()).not.toMatch(/BÍMẬT|EN BÍMẬT/);
  });
});
