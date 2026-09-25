import { jest } from '@jest/globals';
import { hasInfra, startE2eApp, type E2eApp } from '../../test-support/e2e-app.js';

const maybeDescribe = hasInfra ? describe : describe.skip;

maybeDescribe('export edge cases (e2e)', () => {
  jest.setTimeout(60_000);
  let e2e: E2eApp;
  let owner: { id: string; token: string };
  let meetingId: string;

  beforeAll(async () => {
    e2e = await startE2eApp();
    owner = await e2e.createUser();
    meetingId = (
      await e2e.http('POST', '/meetings', owner.token, {
        title: 'Test export',
        source_language: 'vi-VN',
        audio_source: 'device_mic',
        recording_quality: 'standard',
      })
    ).body.id;
    await e2e.http('POST', `/meetings/${meetingId}/segments/bulk`, owner.token, {
      segments: [
        { seq: 1, text: 'Chào mọi người', started_at_ms: 4000, ended_at_ms: 6000 },
      ],
    });
  });
  afterAll(async () => e2e?.close());

  const raw = async (query: string, token = owner.token) => {
    const res = await fetch(`${e2e.baseUrl}/api/meetings/${meetingId}/export?${query}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    return { status: res.status, headers: res.headers, body: await res.text() };
  };

  it('export include=translation without transcript is allowed', async () => {
    const res = await raw('format=markdown&include=translation');
    expect(res.status).toBe(200);
    // Should accept translation section alone even if no transcript is included
    expect(res.body).toContain('Test export');
  });

  it('export with invalid include parameter returns 400', async () => {
    const res = await raw('format=markdown&include=invalid');
    expect(res.status).toBe(400);
    expect(res.body).toContain('VALIDATION_ERROR');
  });

  it('export with multiple include sections separated by comma is allowed', async () => {
    const res = await raw('format=markdown&include=summary,transcript');
    expect(res.status).toBe(200);
  });
});
