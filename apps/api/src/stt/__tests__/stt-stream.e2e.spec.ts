import { jest } from '@jest/globals';
import { hasInfra, startE2eApp, type E2eApp } from '../../test-support/e2e-app.js';
import { SttStreamTestClient, until } from './stt-stream-client.js';

const maybeDescribe = hasInfra ? describe : describe.skip;
const SECRET_TEXT = 'bí mật điều khoản số bảy';

maybeDescribe('streaming speech recognition (e2e, compiled server + fake Gemini Live over WebSocket)', () => {
  jest.setTimeout(60_000);
  let e2e: E2eApp;
  let user: { id: string; token: string };
  const clients: SttStreamTestClient[] = [];
  const connect = async (token = user.token) => {
    const client = await SttStreamTestClient.connect(e2e.baseUrl, token);
    clients.push(client);
    return client;
  };
  const live = () => e2e.gemini.live;

  beforeAll(async () => {
    e2e = await startE2eApp({ STT_LIVE_USAGE_INTERVAL_MS: '300', STT_LIVE_FLUSH_MS: '300', STT_LIVE_MAX_STARTS_PER_MIN: '100' });
    user = await e2e.createUser();
  });
  afterEach(() => {
    live().refuseWith = null;
    live().finalOnEnd = null;
    while (clients.length) clients.pop()!.close();
  });
  afterAll(async () => e2e?.close());

  it('refuses a handshake without a valid token', async () => {
    await expect(SttStreamTestClient.connect(e2e.baseUrl, undefined)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    await expect(SttStreamTestClient.connect(e2e.baseUrl, 'garbage')).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    await expect(SttStreamTestClient.connect(e2e.baseUrl, e2e.tokenFor(user.id, -10))).rejects.toMatchObject({ code: 'TOKEN_EXPIRED' });
  });

  it('refuses a user who has not accepted the current consent text, without opening a Live session', async () => {
    const old = await e2e.createUser();
    await e2e.db.query('UPDATE users SET consent_version = 2 WHERE id = $1', [old.id]);
    const before = live().sessions.length;
    const client = await connect(old.token);
    expect(await client.start({ language: 'vi-VN' })).toMatchObject({ ok: false, error: { code: 'CONSENT_REQUIRED' } });
    expect(live().sessions).toHaveLength(before);
  });

  it('validates the start payload and the order of events', async () => {
    const client = await connect();
    expect(await client.start({ language: 'fr-FR' })).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } });
    client.audio(3200);
    await client.waitFor((e) => e.event === 'stt_error' && e.code === 'STREAM_NOT_STARTED');
    expect(await client.stop()).toMatchObject({ ok: false, error: { code: 'STREAM_NOT_STARTED' } });
  });

  it('streams audio to a verbatim, language-hinted Live session and relays partials and finals', async () => {
    const client = await connect();
    const before = live().sessions.length;
    expect(await client.start({ language: 'vi-VN' })).toEqual({ ok: true });
    const session = live().sessions[before];
    expect(session.setup.inputAudioTranscription).toMatchObject({ languageCodes: ['vi-VN'], mode: 'VERBATIM' });

    for (let i = 0; i < 5; i++) client.audio(3200);
    await until(() => session.audioBytes === 16_000);
    session.interim('xin ch');
    session.final(SECRET_TEXT);
    await client.waitFor((e) => e.event === 'stt_partial' && e.text === 'xin ch');
    await client.waitFor((e) => e.event === 'stt_final' && e.text === SECRET_TEXT);

    await new Promise((r) => setTimeout(r, 1300)); // long enough for the usage meter to bill a second
    live().finalOnEnd = 'câu chốt cuối';
    session.interim('câu chốt');
    expect(await client.stop()).toEqual({ ok: true });
    expect(client.events).toContainEqual({ event: 'stt_final', text: 'câu chốt cuối' });
    expect(session.audioStreamEnded).toBe(true);
    await until(() => session.closed);

    // The stream's time was recorded as stt-live usage, attributed to the user, at the audio token rate.
    await new Promise((r) => setTimeout(r, 200)); // the final remainder row is written just after the ack
    const { rows } = await e2e.db.query("SELECT input_tokens, output_tokens, model FROM usage_records WHERE user_id = $1 AND operation = 'stt-live'", [user.id]);
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0]).toMatchObject({ output_tokens: 0, model: 'gemini-3.5-transcribe-live' });
    expect(rows[0].input_tokens).toBeGreaterThanOrEqual(32);
  });

  it('closes the Live session when the client disconnects', async () => {
    const client = await connect();
    const before = live().sessions.length;
    await client.start({ language: 'en-US' });
    const session = live().sessions[before];
    client.close();
    await until(() => session.closed);
  });

  it('replaces the older stream of the same user', async () => {
    const first = await connect();
    const second = await connect();
    const before = live().sessions.length;
    expect(await first.start({ language: 'vi-VN' })).toEqual({ ok: true });
    expect(await second.start({ language: 'vi-VN' })).toEqual({ ok: true });
    await first.waitFor((e) => e.event === 'stt_error' && e.code === 'STREAM_REPLACED');
    await until(() => live().sessions[before].closed);
    expect(live().sessions[before + 1].closed).toBe(false);
  });

  it('ends a running stream with CONSENT_REQUIRED once the user\'s consent is no longer current', async () => {
    const other = await e2e.createUser();
    const client = await connect(other.token);
    expect(await client.start({ language: 'vi-VN' })).toEqual({ ok: true });
    await e2e.db.query('UPDATE users SET consent_version = 2 WHERE id = $1', [other.id]);
    await client.waitFor((e) => e.event === 'stt_error' && e.code === 'CONSENT_REQUIRED');
  });

  it('ends a running stream with TOKEN_EXPIRED shortly after its access token expires', async () => {
    const short = await e2e.createUser();
    const client = await connect(e2e.tokenFor(short.id, 1));
    expect(await client.start({ language: 'vi-VN' })).toEqual({ ok: true });
    await client.waitFor((e) => e.event === 'stt_error' && e.code === 'TOKEN_EXPIRED', 15_000);
  });

  it('drops a socket that keeps sending audio without a started stream', async () => {
    const client = await connect();
    for (let i = 0; i < 30; i++) client.audio(3200);
    await until(() => !client.socket.connected);
    expect(client.events.filter((e) => e.event === 'stt_error')).toHaveLength(1);
  });

  it('ends a stream whose frame is over the size cap', async () => {
    const client = await connect();
    await client.start({ language: 'vi-VN' });
    client.audio(70_000);
    await client.waitFor((e) => e.event === 'stt_error' && e.code === 'RATE_LIMITED');
  });

  it('answers AI_SERVICE_UNAVAILABLE when Gemini Live cannot be reached', async () => {
    live().refuseWith = 503;
    const client = await connect();
    expect(await client.start({ language: 'vi-VN' })).toMatchObject({ ok: false, error: { code: 'AI_SERVICE_UNAVAILABLE' } });
  });

  it('answers QUOTA_EXCEEDED when the monthly budget is spent', async () => {
    const poor = await e2e.createUser();
    await e2e.db.query('UPDATE users SET monthly_token_budget = 10 WHERE id = $1', [poor.id]);
    await e2e.db.query("INSERT INTO usage_records (user_id, operation, model, input_tokens, output_tokens) VALUES ($1, 'stt-live', 'm', 10, 0)", [poor.id]);
    const client = await connect(poor.token);
    expect(await client.start({ language: 'vi-VN' })).toMatchObject({ ok: false, error: { code: 'QUOTA_EXCEEDED' } });
  });

  it('never writes audio or transcript text to the server log', () => {
    const logs = e2e.logs();
    expect(logs).not.toContain(SECRET_TEXT);
    expect(logs).not.toContain('câu chốt');
    expect(logs).not.toContain(Buffer.alloc(3200, 1).toString('base64').slice(0, 64));
  });
});

maybeDescribe('streaming speech recognition: Live session rotation (e2e)', () => {
  jest.setTimeout(60_000);
  let e2e: E2eApp;

  beforeAll(async () => {
    e2e = await startE2eApp({
      STT_LIVE_ROTATE_MS: '2500',
      STT_LIVE_QUIET_WINDOW_MS: '1500',
      STT_LIVE_OVERLAP_MS: '1000',
      STT_LIVE_FLUSH_MS: '300',
    });
  });
  afterAll(async () => e2e?.close());

  it('rotates to a fresh Live session at a pause, replays the overlap and does not repeat words at the seam', async () => {
    const user = await e2e.createUser();
    const client = await SttStreamTestClient.connect(e2e.baseUrl, user.token);
    const live = e2e.gemini.live;
    const before = live.sessions.length;
    expect(await client.start({ language: 'vi-VN' })).toEqual({ ok: true });
    const [old] = [live.sessions[before]];

    client.audio(32_000);
    old.final('chúng ta bắt đầu cuộc họp hôm nay');
    await client.waitFor((e) => e.event === 'stt_final');
    await until(() => live.sessions.length === before + 2);
    const fresh = live.sessions[before + 1];

    await until(() => old.closed);
    expect(old.audioStreamEnded).toBe(true);
    // The new session was replayed the last second of audio before taking over.
    await until(() => fresh.audioBytes >= 32_000);

    fresh.final('cuộc họp hôm nay có ba nội dung');
    await client.waitFor((e) => e.event === 'stt_final' && e.text === 'có ba nội dung');
    expect(client.events.filter((e) => e.event === 'stt_final').map((e) => (e as { text: string }).text)).toEqual([
      'chúng ta bắt đầu cuộc họp hôm nay',
      'có ba nội dung',
    ]);

    client.audio(3200);
    await until(() => fresh.audioBytes > 32_000);
    expect(await client.stop()).toEqual({ ok: true });
    client.close();
  });

  it('reopens a Live session Gemini drops and keeps the stream going', async () => {
    const user = await e2e.createUser();
    const client = await SttStreamTestClient.connect(e2e.baseUrl, user.token);
    const live = e2e.gemini.live;
    const before = live.sessions.length;
    await client.start({ language: 'en-US' });
    client.audio(6400);
    live.sessions[before].drop();
    await until(() => live.sessions.length === before + 2);
    live.sessions[before + 1].final('still here');
    await client.waitFor((e) => e.event === 'stt_final' && e.text === 'still here');
    client.close();
  });
});
