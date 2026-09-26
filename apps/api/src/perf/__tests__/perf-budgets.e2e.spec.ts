import { jest } from '@jest/globals';
import { hasInfra, startE2eApp, type E2eApp } from '../../test-support/e2e-app.js';
import { WsTestClient } from '../../realtime/__tests__/ws-test-client.js';

const maybeDescribe = hasInfra ? describe : describe.skip;
const NEW_MEETING = { source_language: 'vi-VN', audio_source: 'device_mic', recording_quality: 'standard' };
const p95 = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.ceil(xs.length * 0.95) - 1];

/**
 * Our own share of NFR-05/06, run in CI with the fake Gemini (clarifications 2026-09-27): if the server
 * gets slower, the build breaks. The model's share is measured against real Gemini by `graph:check` /
 * `qa:check` and recorded in docs/nfr-verification.md.
 */
maybeDescribe('performance budgets (e2e, compiled server + fake Gemini)', () => {
  jest.setTimeout(180_000);
  let e2e: E2eApp;
  let owner: { id: string; token: string };
  const create = async () => (await e2e.http('POST', '/meetings', owner.token, NEW_MEETING)).body.id as string;
  const waitReady = async (id: string, timeoutMs: number) => {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const s = (await e2e.http('GET', `/meetings/${id}`, owner.token)).body.status;
      if (s === 'ready') return;
      if (Date.now() > deadline) throw new Error(`still ${s} after ${timeoutMs}ms`);
      await new Promise((r) => setTimeout(r, 100));
    }
  };

  beforeAll(async () => {
    e2e = await startE2eApp({ QA_MIN_SIMILARITY: '0.3' });
    owner = await e2e.createUser();
  });
  afterAll(async () => e2e?.close());

  it('NFR-05 display: a segment is durably stored and acked within 500 ms at p95 across 10 live meetings', async () => {
    const PER_MEETING = 20;
    const latencies: number[] = [];
    await Promise.all(
      Array.from({ length: 10 }, async () => {
        const id = await create();
        const client = await WsTestClient.connect(e2e.baseUrl, owner.token);
        await client.join(id);
        const sentAt = new Map<number, number>();
        for (let seq = 1; seq <= PER_MEETING; seq++) {
          sentAt.set(seq, Date.now());
          client.send(seq, `câu nói số ${seq} trong cuộc họp`);
          await new Promise((r) => setTimeout(r, 100));
        }
        await client.waitForReplies(PER_MEETING, 15_000);
        for (const [seq, at] of client.ackedAt) latencies.push(at - sentAt.get(seq)!);
        client.close();
      }),
    );
    expect(latencies).toHaveLength(200);
    // eslint-disable-next-line no-console -- the measured number is the point of this test in CI logs
    console.info(`[perf] segment ack p95 ${p95(latencies)} ms over ${latencies.length} segments / 10 meetings`);
    expect(p95(latencies)).toBeLessThan(500);
  });

  it('NFR-06 pipeline: a 60-minute meeting goes from end to ready in under 30 s of our own processing', async () => {
    const id = await create();
    const lines = ['ngân sách quý bốn tăng', 'anh Bình phụ trách thanh toán', 'chị Lan cần thêm hai ngày', 'họp lại thứ Tư tuần sau'];
    const segments = Array.from({ length: 600 }, (_, i) => ({ seq: i + 1, text: `${lines[i % lines.length]} lần ${i}`, started_at_ms: i * 6000, ended_at_ms: i * 6000 + 5000 }));
    for (let i = 0; i < segments.length; i += 500) {
      expect((await e2e.http('POST', `/meetings/${id}/segments/bulk`, owner.token, { segments: segments.slice(i, i + 500) })).status).toBeLessThan(300);
    }
    const started = Date.now();
    await e2e.http('POST', `/meetings/${id}/end`, owner.token, { last_seq: 600 });
    await waitReady(id, 60_000);
    const pipelineMs = Date.now() - started;
    // eslint-disable-next-line no-console -- see above
    console.info(`[perf] 60-min meeting end → ready ${pipelineMs} ms (fake Gemini)`);
    expect(pipelineMs).toBeLessThan(30_000);

    // NFR-05 Q&A: the server's part of an answer on that meeting stays under 1 s at p95.
    const times: number[] = [];
    for (let i = 0; i < 10; i++) {
      const t = Date.now();
      expect((await e2e.http('POST', `/meetings/${id}/qa`, owner.token, { question: `ngân sách quý bốn thế nào ${i}` })).status).toBe(200);
      times.push(Date.now() - t);
    }
    // eslint-disable-next-line no-console -- see above
    console.info(`[perf] Q&A server part p95 ${p95(times)} ms over ${times.length} questions (fake Gemini)`);
    expect(p95(times)).toBeLessThan(1000);
  });
});
