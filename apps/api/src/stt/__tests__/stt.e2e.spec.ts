import { jest } from '@jest/globals';
import { randomUUID } from 'node:crypto';
import { readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { STT_MAX_AUDIO_BYTES } from '@meetio/shared';
import { hasInfra, startE2eApp, type E2eApp } from '../../test-support/e2e-app.js';

const maybeDescribe = hasInfra ? describe : describe.skip;

maybeDescribe('server-side speech recognition (e2e, compiled server + fake Gemini over HTTP)', () => {
  jest.setTimeout(60_000);
  let e2e: E2eApp;
  let user: { id: string; token: string };
  const AUDIO = Buffer.from('not-really-aac-but-opaque-bytes');

  /** multipart upload — `e2e.http` only speaks JSON. */
  // Bodies are asserted field by field, like E2eApp.http.
  const upload = async (
    token: string | null,
    opts: { audio?: Buffer | null; mime?: string; fields?: Record<string, string> } = {},
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<{ status: number; body: any }> => {
    const form = new FormData();
    const audio = opts.audio === undefined ? AUDIO : opts.audio;
    if (audio) form.append('audio', new Blob([new Uint8Array(audio)], { type: opts.mime ?? 'audio/mp4' }), 'chunk.m4a');
    for (const [k, v] of Object.entries(opts.fields ?? { language: 'vi-VN' })) form.append(k, v);
    const response = await fetch(`${e2e.baseUrl}/api/stt/transcribe`, {
      method: 'POST',
      headers: token ? { authorization: `Bearer ${token}` } : {},
      body: form,
    });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null };
  };

  beforeAll(async () => {
    e2e = await startE2eApp();
    user = await e2e.createUser();
  });
  afterAll(async () => e2e?.close());

  it('refuses a request without a token', async () => {
    expect((await upload(null)).status).toBe(401);
  });

  it('refuses a user who only accepted the previous consent text (403 CONSENT_REQUIRED) without calling Gemini', async () => {
    const old = await e2e.createUser();
    await e2e.db.query('UPDATE users SET consent_version = 2 WHERE id = $1', [old.id]);
    const before = e2e.gemini.calls.length;
    const res = await upload(old.token);
    expect(res.status).toBe(403);
    expect(res.body.error).toMatchObject({ code: 'CONSENT_REQUIRED', details: { consent_version: 4 } });
    expect(e2e.gemini.calls).toHaveLength(before);
  });

  it('validates the file part and the fields', async () => {
    const noFile = await upload(user.token, { audio: null });
    expect(noFile.status).toBe(400);
    expect(noFile.body.error.code).toBe('VALIDATION_ERROR');
    const badMime = await upload(user.token, { mime: 'text/plain' });
    expect(badMime.status).toBe(400);
    expect(badMime.body.error.code).toBe('VALIDATION_ERROR');
    const badLang = await upload(user.token, { fields: { language: 'fr-FR' } });
    expect(badLang.status).toBe(400);
    expect(badLang.body.error.code).toBe('VALIDATION_ERROR');
    const noLang = await upload(user.token, { fields: {} });
    expect(noLang.status).toBe(400);
    const badMeeting = await upload(user.token, { fields: { language: 'vi-VN', meeting_id: 'not-a-uuid' } });
    expect(badMeeting.status).toBe(400);
    const empty = await upload(user.token, { audio: Buffer.alloc(0) });
    expect(empty.status).toBe(400);
  });

  it('rejects a chunk over the size limit with 413 in the error envelope, before reaching Gemini', async () => {
    const before = e2e.gemini.calls.length;
    const res = await upload(user.token, { audio: Buffer.alloc(STT_MAX_AUDIO_BYTES + 1, 1) });
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(e2e.gemini.calls).toHaveLength(before);
  });

  it('returns the transcript, sends the audio to Gemini as base64 with the mime type stripped of parameters, and records usage "stt"', async () => {
    let seen: { mimeType: string; data: string } | null = null;
    let prompt = '';
    e2e.gemini.transcribe = (audio, p) => {
      seen = audio;
      prompt = p;
      return '  Xin chào các bạn \n';
    };
    const tmpBefore = new Set(readdirSync(tmpdir()));
    const res = await upload(user.token, { mime: 'audio/mp4; codecs=mp4a.40.2' });
    expect(res).toEqual({ status: 200, body: { text: 'Xin chào các bạn' } });
    expect(seen).toEqual({ mimeType: 'audio/mp4', data: AUDIO.toString('base64') });
    expect(prompt).toContain('vi-VN');
    const { rows } = await e2e.db.query(`SELECT count(*)::int AS n, max(meeting_id::text) AS m FROM usage_records WHERE user_id = $1 AND operation = 'stt'`, [user.id]);
    expect(rows[0]).toEqual({ n: 1, m: null });

    // memory storage: the chunk never touches the disk (no new temp file the size of the upload)
    const written = readdirSync(tmpdir()).filter((f) => !tmpBefore.has(f)).filter((f) => {
      try { return statSync(join(tmpdir(), f)).size === AUDIO.length; } catch { return false; }
    });
    expect(written).toEqual([]);
    // …and neither the transcript nor the audio is logged (NFR-04)
    expect(e2e.logs()).not.toContain('Xin chào các bạn');
    expect(e2e.logs()).not.toContain(AUDIO.toString('base64'));
  });

  it('returns an empty transcript for a silent chunk', async () => {
    e2e.gemini.transcribe = () => '';
    expect((await upload(user.token, { fields: { language: 'en-US' } })).body).toEqual({ text: '' });
  });

  it('attributes usage to the meeting only when it is the caller\'s own', async () => {
    const mine = (await e2e.http('POST', '/meetings', user.token, { source_language: 'vi-VN', audio_source: 'device_mic', recording_quality: 'standard' })).body.id as string;
    const stranger = await e2e.createUser();
    const theirs = (await e2e.http('POST', '/meetings', stranger.token, { source_language: 'vi-VN', audio_source: 'device_mic', recording_quality: 'standard' })).body.id as string;
    e2e.gemini.transcribe = () => 'ok';
    expect((await upload(user.token, { fields: { language: 'vi-VN', meeting_id: mine } })).status).toBe(200);
    expect((await upload(user.token, { fields: { language: 'vi-VN', meeting_id: theirs } })).status).toBe(200);
    expect((await upload(user.token, { fields: { language: 'vi-VN', meeting_id: randomUUID() } })).status).toBe(200);
    const { rows } = await e2e.db.query(`SELECT meeting_id FROM usage_records WHERE operation = 'stt' AND meeting_id = ANY($1::uuid[])`, [[mine, theirs]]);
    expect(rows).toEqual([{ meeting_id: mine }]);
  });

  it('throttles at 12 per minute per user', async () => {
    const heavy = await e2e.createUser();
    const statuses: number[] = [];
    for (let i = 0; i < 13; i++) statuses.push((await upload(heavy.token, { audio: null })).status);
    expect(statuses.slice(0, 12).every((s) => s === 400)).toBe(true);
    expect(statuses[12]).toBe(429);
    // another user is not affected
    e2e.gemini.transcribe = () => 'ok';
    expect((await upload((await e2e.createUser()).token)).status).toBe(200);
  });

  it('answers 503 AI_SERVICE_UNAVAILABLE when Gemini is not configured', async () => {
    const bare = await startE2eApp({ GEMINI_API_KEY: '' });
    try {
      const u = await bare.createUser();
      const form = new FormData();
      form.append('audio', new Blob([new Uint8Array(AUDIO)], { type: 'audio/mp4' }), 'chunk.m4a');
      form.append('language', 'vi-VN');
      const response = await fetch(`${bare.baseUrl}/api/stt/transcribe`, { method: 'POST', headers: { authorization: `Bearer ${u.token}` }, body: form });
      expect(response.status).toBe(503);
      expect((await response.json()).error.code).toBe('AI_SERVICE_UNAVAILABLE');
    } finally {
      await bare.close();
    }
  });
});
