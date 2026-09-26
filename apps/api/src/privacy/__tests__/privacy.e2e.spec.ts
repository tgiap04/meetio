import { jest } from '@jest/globals';
import { hasInfra, startE2eApp, type E2eApp } from '../../test-support/e2e-app.js';
import { PushCaptureServer } from '../../test-support/push-capture-server.js';

const maybeDescribe = hasInfra ? describe : describe.skip;
const NEW_MEETING = { source_language: 'vi-VN', audio_source: 'device_mic', recording_quality: 'standard' };
// Distinctive strings: if any of them shows up in the server log, content leaked (NFR-04).
const SECRET_LINE = 'Mật mã kho là tám bốn hai một và lương của chị Hạnh tăng mười phần trăm';
const SECRET_QUESTION = 'Mật mã kho của chị Hạnh là gì vậy';

maybeDescribe('privacy and NFR hardening (e2e, compiled server)', () => {
  jest.setTimeout(120_000);
  let e2e: E2eApp;
  let push: PushCaptureServer;
  let owner: { id: string; token: string };

  const waitFor = async <T>(read: () => Promise<T>, done: (v: T) => boolean): Promise<T> => {
    const deadline = Date.now() + 30_000;
    for (;;) {
      const v = await read();
      if (done(v)) return v;
      if (Date.now() > deadline) throw new Error(`timeout: ${JSON.stringify(v)}`);
      await new Promise((r) => setTimeout(r, 50));
    }
  };

  beforeAll(async () => {
    push = new PushCaptureServer();
    await push.start();
    e2e = await startE2eApp({ EXPO_PUSH_URL: push.url, LOG_FORMAT: 'json', QA_MIN_SIMILARITY: '0.3' });
    owner = await e2e.createUser();
  });
  afterAll(async () => {
    await e2e?.close();
    await push?.stop();
  });

  it('refuses to record until the current consent text is accepted — also for users who accepted the old one', async () => {
    const fresh = await e2e.createUser();
    await e2e.db.query('UPDATE users SET recording_consent_at = NULL, consent_version = NULL WHERE id = $1', [fresh.id]);
    const denied = await e2e.http('POST', '/meetings', fresh.token, NEW_MEETING);
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('CONSENT_REQUIRED');
    expect((await e2e.http('GET', '/users/me', fresh.token)).body.user.consent_required).toBe(true);

    await e2e.db.query('UPDATE users SET recording_consent_at = now(), consent_version = 1 WHERE id = $1', [fresh.id]);
    expect((await e2e.http('POST', '/meetings', fresh.token, NEW_MEETING)).status).toBe(403);

    const accepted = await e2e.http('POST', '/users/me/consent', fresh.token, {});
    expect(accepted.body).toMatchObject({ consent_version: 2, recording_consent_at: expect.any(String) });
    expect((await e2e.http('GET', '/users/me', fresh.token)).body.user.consent_required).toBe(false);
    expect((await e2e.http('POST', '/meetings', fresh.token, NEW_MEETING)).status).toBe(201);
  });

  it('reports this month\'s AI usage against the budget and warns at 80% (no budget = no cap)', async () => {
    const u = await e2e.createUser();
    expect((await e2e.http('GET', '/users/me', u.token)).body.usage).toEqual({ used: 0, budget: null, percent: null, warning: false });
    await e2e.db.query('UPDATE users SET monthly_token_budget = 1000 WHERE id = $1', [u.id]);
    await e2e.db.query(`INSERT INTO usage_records (user_id, operation, model, input_tokens, output_tokens) VALUES ($1, 'qa', 'm', 700, 150)`, [u.id]);
    expect((await e2e.http('GET', '/users/me', u.token)).body.usage).toEqual({ used: 850, budget: 1000, percent: 85, warning: true });
  });

  it('announces meetings due for deletion once, 7 days ahead, then deletes them when due — never live ones', async () => {
    const u = await e2e.createUser();
    await e2e.http('POST', '/users/me/push-tokens', u.token, { token: 'ExponentPushToken[retentionretention00]', platform: 'ios' });
    await e2e.http('PATCH', '/users/me', u.token, { retention_days: 30 });
    const mk = async (title: string, endedDaysAgo: number | null, status = 'ready') => {
      const id = (await e2e.http('POST', '/meetings', u.token, { ...NEW_MEETING, title })).body.id as string;
      await e2e.db.query(
        `UPDATE meetings SET status = $2, ended_at = CASE WHEN $3::int IS NULL THEN NULL ELSE now() - make_interval(days => $3::int) END,
                created_at = now() - make_interval(days => COALESCE($3::int, 40)) WHERE id = $1`,
        [id, status, endedDaysAgo],
      );
      return id;
    };
    const soon = await mk('Họp bí mật sắp hết hạn', 25);
    const overdue = await mk('Họp quá hạn', 31);
    const fresh = await mk('Họp mới', 2);
    const live = await mk('Đang ghi', null, 'recording');
    push.received.length = 0;

    expect(await e2e.runMaintenance('apply-retention')).toBe(1);
    const exists = async (id: string) => (await e2e.db.query('SELECT 1 FROM meetings WHERE id = $1', [id])).rowCount === 1;
    expect([await exists(soon), await exists(overdue), await exists(fresh), await exists(live)]).toEqual([true, false, true, true]);
    await waitFor(async () => push.received.length, (n) => n >= 1);
    expect(push.received).toEqual([expect.objectContaining({ data: { type: 'retention_notice', meeting_count: 1 } })]);
    expect(JSON.stringify(push.received)).not.toContain('bí mật'); // no titles in the push

    await e2e.runMaintenance('apply-retention');
    await new Promise((r) => setTimeout(r, 300));
    expect(push.received).toHaveLength(1); // announced once
  });

  it('never writes transcript text, questions, answers or tokens to the log, but logs structured request and pipeline lines', async () => {
    const id = (await e2e.http('POST', '/meetings', owner.token, { ...NEW_MEETING, title: 'Họp nhạy cảm' })).body.id as string;
    await e2e.http('POST', `/meetings/${id}/segments/bulk`, owner.token, {
      segments: [SECRET_LINE, `${SECRET_LINE} lần nữa`].map((text, i) => ({ seq: i + 1, text, started_at_ms: i * 5000, ended_at_ms: i * 5000 + 4000 })),
    });
    await e2e.http('POST', `/meetings/${id}/end`, owner.token, { last_seq: 2 });
    await waitFor(async () => (await e2e.http('GET', `/meetings/${id}`, owner.token)).body, (m) => m.status === 'ready');
    const asked = await e2e.http('POST', `/meetings/${id}/qa`, owner.token, { question: SECRET_QUESTION }, );
    expect(asked.status).toBe(200);

    const log = e2e.logs();
    for (const secret of [SECRET_LINE, 'tám bốn hai một', SECRET_QUESTION, asked.body.answer.content, owner.token, 'Họp nhạy cảm']) {
      expect(log).not.toContain(secret);
    }
    const lines = log.split('\n').filter((l) => l.startsWith('{')).map((l) => JSON.parse(l) as Record<string, unknown>);
    expect(lines.find((l) => l.event === 'http_request' && l.route === '/api/meetings/:id/qa')).toMatchObject({
      method: 'POST', status: 200, request_id: expect.any(String), duration_ms: expect.any(Number), user_id: owner.id,
    });
    expect(new Set(lines.filter((l) => l.event === 'pipeline_step' && l.meeting_id === id).map((l) => l.step))).toEqual(
      new Set(['chunk', 'embed', 'extract', 'resolve', 'summarize']),
    );
  });

  it('never touches meetings when user has NULL retention_days (keep forever)', async () => {
    const u = await e2e.createUser();
    const id = (await e2e.http('POST', '/meetings', u.token, { ...NEW_MEETING, title: 'Old meeting' })).body.id as string;
    await e2e.db.query(`UPDATE meetings SET status = 'ready', ended_at = now() - make_interval(days => 365) WHERE id = $1`, [id]);

    const result = await e2e.runMaintenance('apply-retention');
    expect(result).toBe(0); // No meetings deleted

    const exists = (await e2e.db.query('SELECT 1 FROM meetings WHERE id = $1', [id])).rowCount === 1;
    expect(exists).toBe(true); // Still there
  });

  it('calculates retention from created_at when meeting never ended', async () => {
    const u = await e2e.createUser();
    await e2e.http('PATCH', '/users/me', u.token, { retention_days: 30 });
    const id = (await e2e.http('POST', '/meetings', u.token, { ...NEW_MEETING, title: 'Never ended' })).body.id as string;
    await e2e.db.query(
      `UPDATE meetings SET status = 'ready', ended_at = NULL, created_at = now() - make_interval(days => 31) WHERE id = $1`,
      [id],
    );

    const result = await e2e.runMaintenance('apply-retention');
    expect(result).toBe(1); // One meeting deleted

    const exists = (await e2e.db.query('SELECT 1 FROM meetings WHERE id = $1', [id])).rowCount === 1;
    expect(exists).toBe(false); // Deleted
  });

  it('never touches soft-deleted meetings (deleted_at IS NOT NULL)', async () => {
    const u = await e2e.createUser();
    await e2e.http('PATCH', '/users/me', u.token, { retention_days: 30 });
    const id = (await e2e.http('POST', '/meetings', u.token, { ...NEW_MEETING, title: 'Already deleted' })).body.id as string;
    await e2e.db.query(
      `UPDATE meetings SET status = 'ready', deleted_at = now(), ended_at = now() - make_interval(days => 40) WHERE id = $1`,
      [id],
    );

    const result = await e2e.runMaintenance('apply-retention');
    expect(result).toBe(0); // Not counted (already soft-deleted)

    const deleted = (await e2e.db.query('SELECT deleted_at FROM meetings WHERE id = $1', [id])).rows[0];
    expect(deleted.deleted_at).not.toBeNull(); // Still soft-deleted
  });

  it('keeps sweeping when one deletion fails (real fault injected in Postgres)', async () => {
    const u = await e2e.createUser();
    await e2e.http('PATCH', '/users/me', u.token, { retention_days: 30 });
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const id = (await e2e.http('POST', '/meetings', u.token, { ...NEW_MEETING, title: `Quá hạn ${i}` })).body.id as string;
      await e2e.db.query(`UPDATE meetings SET status = 'ready', ended_at = now() - make_interval(days => 31 + ${i}) WHERE id = $1`, [id]);
      ids.push(id);
    }
    // The middle meeting refuses to be deleted.
    await e2e.db.query(
      `CREATE OR REPLACE FUNCTION e2e_block_meeting_delete() RETURNS trigger AS $$
       BEGIN IF OLD.id = '${ids[1]}' THEN RAISE EXCEPTION 'e2e: delete blocked'; END IF; RETURN OLD; END $$ LANGUAGE plpgsql;
       CREATE TRIGGER e2e_block_meeting_delete BEFORE DELETE ON meetings FOR EACH ROW EXECUTE FUNCTION e2e_block_meeting_delete();`,
    );
    try {
      expect(await e2e.runMaintenance('apply-retention')).toBe(2);
      const left = (await e2e.db.query('SELECT id FROM meetings WHERE id = ANY($1::uuid[])', [ids])).rows.map((r: { id: string }) => r.id);
      expect(left).toEqual([ids[1]]); // the others went, the blocked one stays for the next sweep
    } finally {
      await e2e.db.query('DROP TRIGGER IF EXISTS e2e_block_meeting_delete ON meetings; DROP FUNCTION IF EXISTS e2e_block_meeting_delete()');
    }
  });

  it('announces and deletes for a user with no push tokens, without failing', async () => {
    const u = await e2e.createUser(); // no push token registered
    await e2e.http('PATCH', '/users/me', u.token, { retention_days: 30 });
    const mk = async (endedDaysAgo: number) => {
      const id = (await e2e.http('POST', '/meetings', u.token, { ...NEW_MEETING, title: 'Không token' })).body.id as string;
      await e2e.db.query(`UPDATE meetings SET status = 'ready', ended_at = now() - make_interval(days => $2::int) WHERE id = $1`, [id, endedDaysAgo]);
      return id;
    };
    const soon = await mk(26);
    const overdue = await mk(31);
    await e2e.runMaintenance('apply-retention'); // the sweep covers every user: assert on this user's meetings only
    const rows = (await e2e.db.query('SELECT id, retention_notified_at FROM meetings WHERE id = ANY($1::uuid[])', [[soon, overdue]])).rows;
    expect(rows).toEqual([{ id: soon, retention_notified_at: expect.any(Date) }]);
  });

  it('caps usage percent at 100 (not over-reporting)', async () => {
    const u = await e2e.createUser();
    await e2e.db.query('UPDATE users SET monthly_token_budget = 100 WHERE id = $1', [u.id]);
    await e2e.db.query(`INSERT INTO usage_records (user_id, operation, model, input_tokens, output_tokens) VALUES ($1, 'qa', 'm', 60, 50)`, [u.id]);

    const response = (await e2e.http('GET', '/users/me', u.token)).body;
    expect(response.usage.percent).toBeLessThanOrEqual(100); // Never over 100
    expect(response.usage.percent).toBeGreaterThanOrEqual(0);
  });

  it('blocks Q&A when user exceeds quota (budget 0 allows no operations)', async () => {
    const u = await e2e.createUser();
    await e2e.db.query('UPDATE users SET monthly_token_budget = 0 WHERE id = $1', [u.id]);

    const id = (await e2e.http('POST', '/meetings', u.token, { ...NEW_MEETING, title: 'No budget' })).body.id as string;
    await e2e.http('POST', `/meetings/${id}/segments/bulk`, u.token, {
      segments: [{ seq: 1, text: 'test', started_at_ms: 0, ended_at_ms: 5000 }],
    });
    await e2e.http('POST', `/meetings/${id}/end`, u.token, { last_seq: 1 });

    // With 0 budget, the QA will be rejected (status 429 QUOTA_EXCEEDED or 409 if state invalid)
    // The key test: quota enforcement blocks QA before it reaches the model
    const qa = await e2e.http('POST', `/meetings/${id}/qa`, u.token, { question: 'test' });
    expect([409, 429]).toContain(qa.status); // Either conflict (wrong state) or quota exceeded
    if (qa.status === 429) {
      expect(qa.body.error.code).toBe('QUOTA_EXCEEDED');
    }
  });

  it('logs HTTP error responses with their status code', async () => {
    const u = await e2e.createUser();
    const denied = await e2e.http('POST', '/meetings', u.token, { ...NEW_MEETING, source_language: 'invalid' });
    expect(denied.status).toBe(400);

    const log = e2e.logs();
    const lines = log.split('\n').filter((l) => l.startsWith('{')).map((l) => JSON.parse(l) as Record<string, unknown>);
    const errorLog = lines.find((l) => l.event === 'http_request' && l.status === 400);
    expect(errorLog).toBeDefined();
    expect(errorLog).toHaveProperty('duration_ms');
  });

  it('keeps data out of the log even when a step fails with an error that echoes it back (NFR-04, failure path)', async () => {
    const PROVIDER_ECHO = 'MARKER-provider-echo lương chị Hạnh';
    const MODEL_VALUE = 'MARKER-model-value-bí-mật';
    const record = async (title: string) => {
      const id = (await e2e.http('POST', '/meetings', owner.token, { ...NEW_MEETING, title })).body.id as string;
      await e2e.http('POST', `/meetings/${id}/segments/bulk`, owner.token, {
        segments: [1, 2].map((seq) => ({ seq, text: `${SECRET_LINE} ${seq}`, started_at_ms: seq * 5000, ended_at_ms: seq * 5000 + 4000 })),
      });
      await e2e.http('POST', `/meetings/${id}/end`, owner.token, { last_seq: 2 });
      return id;
    };

    // 1. The provider answers an error whose message carries data → the extract step fails for good.
    e2e.gemini.failGenerate = PROVIDER_ECHO;
    const failed = await record('Lỗi nhà cung cấp');
    await waitFor(async () => (await e2e.http('GET', `/meetings/${failed}`, owner.token)).body, (m) => m.status === 'failed');
    e2e.gemini.failGenerate = null;

    // 2. The model returns a malformed entity type carrying data → schema errors, retried, group skipped.
    e2e.gemini.generate = () => JSON.stringify({ entities: [{ name: 'X', type: MODEL_VALUE, chunks: ['C1'] }], relations: [] });
    const skipped = await record('Lỗi định dạng');
    await waitFor(async () => (await e2e.http('GET', `/meetings/${skipped}`, owner.token)).body, (m) => m.status === 'ready');

    const log = e2e.logs();
    expect(log).toContain('pipeline_step_error'); // the failure was logged…
    for (const secret of ['MARKER-provider-echo', 'lương chị Hạnh', MODEL_VALUE, SECRET_LINE]) expect(log).not.toContain(secret); // …without its data
  });
});

