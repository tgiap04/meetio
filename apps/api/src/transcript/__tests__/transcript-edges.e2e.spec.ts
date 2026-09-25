import { jest } from '@jest/globals';
import { hasInfra, startE2eApp, type E2eApp } from '../../test-support/e2e-app.js';

const maybeDescribe = hasInfra ? describe : describe.skip;
const NEW_MEETING = { source_language: 'vi-VN', audio_source: 'device_mic', recording_quality: 'standard' };

maybeDescribe('transcript segment boundaries (e2e)', () => {
  jest.setTimeout(60_000);
  let e2e: E2eApp;
  let owner: { id: string; token: string };

  beforeAll(async () => {
    e2e = await startE2eApp();
    owner = await e2e.createUser();
  });
  afterAll(async () => e2e?.close());

  const create = async () => (await e2e.http('POST', '/meetings', owner.token, NEW_MEETING)).body.id as string;

  it('GET /meetings/:id/segments rejects limit=0 with 400', async () => {
    const id = await create();
    const res = await e2e.http('GET', `/meetings/${id}/segments?limit=0`, owner.token);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('GET /meetings/:id/segments rejects limit=501 with 400', async () => {
    const id = await create();
    const res = await e2e.http('GET', `/meetings/${id}/segments?limit=501`, owner.token);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('GET /meetings/:id/segments accepts limit=1 and limit=500', async () => {
    const id = await create();
    await e2e.http('POST', `/meetings/${id}/segments/bulk`, owner.token, {
      segments: [
        { seq: 1, text: 'đoạn 1', started_at_ms: 0, ended_at_ms: 900 },
      ],
    });

    const res1 = await e2e.http('GET', `/meetings/${id}/segments?limit=1`, owner.token);
    expect(res1.status).toBe(200);
    expect(res1.body.items.length).toBeLessThanOrEqual(1);

    const res500 = await e2e.http('GET', `/meetings/${id}/segments?limit=500`, owner.token);
    expect(res500.status).toBe(200);
  });
});
