import { jest } from '@jest/globals';
import { hasInfra, startE2eApp, type E2eApp } from '../../test-support/e2e-app.js';

const maybeDescribe = hasInfra ? describe : describe.skip;

maybeDescribe('meeting export (e2e)', () => {
  jest.setTimeout(60_000);
  let e2e: E2eApp;
  let owner: { id: string; token: string };
  let stranger: { id: string; token: string };
  let meetingId: string;

  beforeAll(async () => {
    e2e = await startE2eApp();
    owner = await e2e.createUser();
    stranger = await e2e.createUser();
    meetingId = (
      await e2e.http('POST', '/meetings', owner.token, {
        title: 'Họp sprint 12',
        source_language: 'vi-VN',
        audio_source: 'device_mic',
        recording_quality: 'standard',
      })
    ).body.id;
    await e2e.http('POST', `/meetings/${meetingId}/segments/bulk`, owner.token, {
      segments: [
        { seq: 1, text: 'Chào mọi người', started_at_ms: 4000, ended_at_ms: 6000 },
        { seq: 2, text: '<b>không phải html</b>', started_at_ms: 9000, ended_at_ms: 11000, gap_before_ms: 2000 },
      ],
    });
    await e2e.db.query(`INSERT INTO action_items (meeting_id, user_id, content, due_date) VALUES ($1, $2, 'Gửi báo cáo', '2026-09-20')`, [meetingId, owner.id]);
  });
  afterAll(async () => e2e?.close());

  const raw = async (query: string, token = owner.token) => {
    const res = await fetch(`${e2e.baseUrl}/api/meetings/${meetingId}/export?${query}`, { headers: { authorization: `Bearer ${token}` } });
    return { status: res.status, headers: res.headers, body: await res.text() };
  };

  it('exports Markdown with title, actions, timed transcript and a not-ready summary note', async () => {
    const res = await raw('format=markdown');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/markdown');
    expect(res.headers.get('content-disposition')).toBe('attachment; filename="hop-sprint-12.md"');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.body).toContain('# Họp sprint 12');
    expect(res.body).toContain('Tóm tắt chưa sẵn sàng');
    expect(res.body).toContain('Gửi báo cáo — hạn 20/09/2026');
    expect(res.body).toContain('**[00:04]** Chào mọi người');
    expect(res.body).toContain('(gián đoạn 2 giây)');
  });

  it('exports escaped, self-contained HTML for on-device PDF printing', async () => {
    const res = await raw('format=html');
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(res.body).toContain('&lt;b&gt;không phải html&lt;/b&gt;');
    expect(res.body).not.toContain('<b>không');
  });

  it('includes only the chosen sections', async () => {
    const res = await raw('format=markdown&include=transcript');
    expect(res.body).not.toContain('## Tóm tắt');
    expect(res.body).not.toContain('Gửi báo cáo');
    expect(res.body).toContain('Chào mọi người');
  });

  it('rejects unknown formats and sections, and hides other users\' meetings', async () => {
    expect((await raw('format=pdf')).status).toBe(400);
    expect((await raw('format=markdown&include=secrets')).status).toBe(400);
    expect((await raw('format=markdown', stranger.token)).status).toBe(404);
  });
});
