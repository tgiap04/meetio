import { jest } from '@jest/globals';
import { randomUUID } from 'node:crypto';
import pgvector from 'pgvector/pg';
import { AppDataSource, registerPgVectorTypes } from '../../database/data-source.js';
import { chunkContentHash } from '../../chunking/chunker.js';
import { fakeGemini, fakeEmbedding } from '../../chunking/__tests__/fake-gemini.js';
import { ExplainedStepError, type StepContext } from '../../pipeline/pipeline-step-handler.js';
import { scriptedSummaryModel, type SummaryRule } from '../../test-support/scripted-summary-model.js';
import { SummarizeStepHandler } from '../summarize-step.handler.js';
import { SUMMARY_ATTEMPTS } from '../summary-generator.js';
import { ActionsService } from '../../actions/actions.service.js';

const maybeDescribe = process.env.DATABASE_URL ? describe : describe.skip;
const filler = (topic: string) => `${topic} ` + 'mọi người trao đổi chi tiết về kế hoạch và tiến độ công việc trong tuần '.repeat(6);

maybeDescribe('summarize step (integration, real Postgres)', () => {
  jest.setTimeout(30_000);
  const users: string[] = [];
  beforeAll(async () => {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
      await registerPgVectorTypes(AppDataSource);
    }
  });
  afterAll(async () => {
    await AppDataSource.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [users]);
    await AppDataSource.destroy();
  });

  async function meeting(texts: string[], lang = 'vi-VN') {
    const userId = randomUUID();
    users.push(userId);
    await AppDataSource.query(`INSERT INTO users (id, email, display_name, password_hash) VALUES ($1, $2, 'S', 'x')`, [userId, `s-${userId}@meetio.test`]);
    const [{ id }] = await AppDataSource.query(
      `INSERT INTO meetings (user_id, title, status, source_language, started_at) VALUES ($1, 'Họp', 'processing', $2, '2026-09-24T09:00:00Z') RETURNING id`,
      [userId, lang],
    );
    const chunkIds: string[] = [];
    for (const [i, text] of texts.entries()) {
      const [row] = await AppDataSource.query(
        `INSERT INTO meeting_chunks (meeting_id, user_id, content, segment_start_seq, segment_end_seq, content_hash) VALUES ($1, $2, $3, $4, $4, $5) RETURNING id`,
        [id, userId, text, (i + 1) * 10, chunkContentHash((i + 1) * 10, (i + 1) * 10, text)],
      );
      chunkIds.push(row.id);
    }
    return { userId, meetingId: id as string, chunkIds };
  }

  async function person(userId: string, meetingId: string, chunkId: string, name: string, normalized: string) {
    const [{ id }] = await AppDataSource.query(
      `INSERT INTO entities (user_id, canonical_name, normalized_name, type, aliases, embedding) VALUES ($1, $2, $3, 'person', '{}', $4) RETURNING id`,
      [userId, name, normalized, pgvector.toSql(fakeEmbedding(name))],
    );
    await AppDataSource.query('INSERT INTO entity_mentions (entity_id, meeting_id, chunk_id, surface_form) VALUES ($1, $2, $3, $4)', [id, meetingId, chunkId, name]);
    return id as string;
  }

  const ctx = (userId: string, meetingId: string): StepContext => ({ userId, meetingId, run: 1, scope: 'full', changedSince: null, signal: new AbortController().signal });
  const run = (rules: SummaryRule[], userId: string, meetingId: string, calls = { embed: 0, count: 0, generate: 0 }, singlePass?: number) =>
    new SummarizeStepHandler(AppDataSource, fakeGemini(AppDataSource, calls, scriptedSummaryModel(rules)).client, singlePass).run(ctx(userId, meetingId));
  const stored = (meetingId: string) =>
    AppDataSource.query('SELECT summary, summary_citations, summary_insufficient FROM meetings WHERE id = $1', [meetingId]).then((r) => r[0]);
  const actions = (meetingId: string) =>
    AppDataSource.query('SELECT content, assignee_entity_id, due_date::text AS due_date, status, source_chunk_id, is_manual FROM action_items WHERE meeting_id = $1 ORDER BY content', [
      meetingId,
    ]);

  it('stores cited points and decisions that point at the right chunk and transcript seq', async () => {
    const m = await meeting([filler('ngân sách'), filler('lịch ra mắt')]);
    await run(
      [
        { when: 'ngân sách', point: 'Ngân sách quý bốn tăng 10%' },
        { when: 'lịch ra mắt', decision: 'Ra mắt vào tháng 11' },
      ],
      m.userId,
      m.meetingId,
    );
    const s = await stored(m.meetingId);
    expect(s.summary_insufficient).toBe(false);
    expect(s.summary_citations).toEqual([
      { kind: 'point', text: 'Ngân sách quý bốn tăng 10%', chunk_ids: [m.chunkIds[0]], segment_seq: 10 },
      { kind: 'decision', text: 'Ra mắt vào tháng 11', chunk_ids: [m.chunkIds[1]], segment_seq: 20 },
    ]);
    expect(s.summary).toBe('• Ngân sách quý bốn tăng 10%\n\nQuyết định:\n• Ra mắt vào tháng 11');
  });

  it('says plainly that a two-minute empty meeting cannot be summarized, without calling the model', async () => {
    const m = await meeting(['alo alo nghe rõ không']);
    const calls = { embed: 0, count: 0, generate: 0 };
    await run([{ when: 'alo', point: 'bịa' }], m.userId, m.meetingId, calls);
    expect(calls.generate).toBe(0);
    expect(await stored(m.meetingId)).toEqual({ summary: 'Cuộc họp quá ngắn hoặc không có đủ nội dung để tóm tắt.', summary_citations: [], summary_insufficient: true });
  });

  it('assigns a task only to a person named for it and mentioned in this meeting — otherwise leaves it empty', async () => {
    const m = await meeting([filler('báo cáo'), filler('thiết kế'), filler('kiểm thử'), filler('hạ tầng')]);
    const binh = await person(m.userId, m.meetingId, m.chunkIds[0], 'anh Bình', 'binh');
    await person(m.userId, m.meetingId, m.chunkIds[1], 'Lan', 'lan');
    await person(m.userId, m.meetingId, m.chunkIds[1], 'Lan (kế toán)', 'lan'); // two people called Lan
    await run(
      [
        { when: 'báo cáo', action: { content: 'Gửi báo cáo', assignee: 'Bình', due_date: '2026-09-26' } },
        { when: 'thiết kế', action: { content: 'Duyệt thiết kế', assignee: 'Lan' } },
        { when: 'kiểm thử', action: { content: 'Chạy kiểm thử', assignee: 'Huy' } }, // not in this meeting
        { when: 'hạ tầng', action: { content: 'Nâng cấp máy chủ', assignee: null } },
      ],
      m.userId,
      m.meetingId,
    );
    expect((await actions(m.meetingId)).map((a: { content: string; assignee_entity_id: string | null; due_date: string | null }) => [a.content, a.assignee_entity_id, a.due_date])).toEqual([
      ['Chạy kiểm thử', null, null],
      ['Duyệt thiết kế', null, null],
      ['Gửi báo cáo', binh, '2026-09-26'],
      ['Nâng cấp máy chủ', null, null],
    ]);
  });

  it('on a re-run keeps what the user ticked, edited or added, replaces untouched AI tasks, and adds no duplicate', async () => {
    const m = await meeting([filler('báo cáo'), filler('thiết kế'), filler('kiểm thử')]);
    const first: SummaryRule[] = [
      { when: 'báo cáo', action: { content: 'Gửi báo cáo' } },
      { when: 'thiết kế', action: { content: 'Duyệt thiết kế' } },
      { when: 'kiểm thử', action: { content: 'Chạy kiểm thử' } },
    ];
    await run(first, m.userId, m.meetingId);
    await AppDataSource.query(`UPDATE action_items SET status = 'done', is_user_edited = true WHERE meeting_id = $1 AND content = 'Gửi báo cáo'`, [m.meetingId]);
    await AppDataSource.query(
      `INSERT INTO action_items (meeting_id, user_id, content, status, is_manual, is_user_edited) VALUES ($1, $2, 'Đặt phòng họp', 'open', true, true)`,
      [m.meetingId, m.userId],
    );

    await run([...first.slice(0, 1), { when: 'kiểm thử', action: { content: 'Chạy kiểm thử hồi quy' } }], m.userId, m.meetingId);

    const rows = (await actions(m.meetingId)).map((a: { content: string; status: string; is_manual: boolean }) => [a.content, a.status, a.is_manual]);
    expect(rows).toHaveLength(3);
    expect(rows).toEqual(
      expect.arrayContaining([
        ['Chạy kiểm thử hồi quy', 'open', false],
        ['Gửi báo cáo', 'done', false], // kept, and not re-added
        ['Đặt phòng họp', 'open', true],
      ]),
    );
  });

  it('does not bring back an AI task the user deleted when the pipeline runs again', async () => {
    const m = await meeting([filler('báo cáo'), filler('thiết kế')]);
    const rules: SummaryRule[] = [
      { when: 'báo cáo', action: { content: 'Gửi báo cáo' } },
      { when: 'thiết kế', action: { content: 'Duyệt thiết kế' } },
    ];
    await run(rules, m.userId, m.meetingId);
    const [wrong] = await AppDataSource.query(`SELECT id FROM action_items WHERE meeting_id = $1 AND content = 'Duyệt thiết kế'`, [m.meetingId]);
    await new ActionsService(AppDataSource).remove(m.userId, wrong.id);

    await run([...rules, { when: 'thiết kế', action: { content: 'duyệt  THIẾT KẾ.' } }], m.userId, m.meetingId); // same task, reworded casing/punctuation

    expect((await actions(m.meetingId)).map((a: { content: string }) => a.content)).toEqual(['Gửi báo cáo']);
  });

  it('an empty edit does not make an AI task "user-touched" — a re-run still replaces it', async () => {
    const m = await meeting([filler('báo cáo')]);
    await run([{ when: 'báo cáo', action: { content: 'Gửi báo cáo' } }], m.userId, m.meetingId);
    const [item] = await AppDataSource.query('SELECT id FROM action_items WHERE meeting_id = $1', [m.meetingId]);
    await new ActionsService(AppDataSource).update(m.userId, item.id, {});

    await run([{ when: 'báo cáo', action: { content: 'Gửi báo cáo tuần' } }], m.userId, m.meetingId);

    expect((await actions(m.meetingId)).map((a: { content: string }) => a.content)).toEqual(['Gửi báo cáo tuần']);
  });

  it('summarizes a meeting too long for one call in two tiers, keeping citations to the real chunks', async () => {
    const m = await meeting([filler('ngân sách'), filler('lịch ra mắt'), filler('tuyển dụng')]);
    const calls = { embed: 0, count: 0, generate: 0 };
    await run(
      [
        { when: 'ngân sách', point: 'Ngân sách tăng' },
        { when: 'lịch ra mắt', point: 'Ra mắt tháng 11' },
        { when: 'tuyển dụng', point: 'Tuyển thêm hai người' },
      ],
      m.userId,
      m.meetingId,
      calls,
      50, // every chunk is its own slice
    );
    expect(calls.generate).toBe(4); // three slices + one merge
    const [point] = (await stored(m.meetingId)).summary_citations;
    expect(point.text).toBe('Tổng hợp: Ngân sách tăng / Ra mắt tháng 11 / Tuyển thêm hai người');
    expect(point.chunk_ids).toEqual(m.chunkIds);
  });

  it('fails the step with a readable reason after the answers keep failing the schema', async () => {
    const m = await meeting([filler('ngân sách')]);
    const calls = { embed: 0, count: 0, generate: 0 };
    const handler = new SummarizeStepHandler(AppDataSource, fakeGemini(AppDataSource, calls, () => 'Tóm tắt: ...').client);
    await expect(handler.run(ctx(m.userId, m.meetingId))).rejects.toBeInstanceOf(ExplainedStepError);
    expect(calls.generate).toBe(SUMMARY_ATTEMPTS);
    expect((await stored(m.meetingId)).summary).toBeNull();
  });
});
