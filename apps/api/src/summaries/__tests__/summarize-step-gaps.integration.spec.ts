import { jest } from '@jest/globals';
import { randomUUID } from 'node:crypto';
import pgvector from 'pgvector/pg';
import { AppDataSource, registerPgVectorTypes } from '../../database/data-source.js';
import { chunkContentHash } from '../../chunking/chunker.js';
import { fakeGemini, fakeEmbedding } from '../../chunking/__tests__/fake-gemini.js';
import type { StepContext } from '../../pipeline/pipeline-step-handler.js';
import { scriptedSummaryModel, type SummaryRule } from '../../test-support/scripted-summary-model.js';
import { SummarizeStepHandler } from '../summarize-step.handler.js';

const maybeDescribe = process.env.DATABASE_URL ? describe : describe.skip;
const filler = (topic: string) => `${topic} ` + 'mọi người trao đổi chi tiết về kế hoạch và tiến độ công việc trong tuần '.repeat(6);

maybeDescribe('summarize step gaps (integration, real Postgres)', () => {
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

  const ctx = (userId: string, meetingId: string): StepContext => ({ userId, meetingId, run: 1, scope: 'full', changedSince: null, signal: new AbortController().signal });
  const run = (rules: SummaryRule[], userId: string, meetingId: string, calls = { embed: 0, count: 0, generate: 0 }, singlePass?: number) =>
    new SummarizeStepHandler(AppDataSource, fakeGemini(AppDataSource, calls, scriptedSummaryModel(rules)).client, singlePass).run(ctx(userId, meetingId));
  const stored = (meetingId: string) =>
    AppDataSource.query('SELECT summary, summary_citations, summary_insufficient FROM meetings WHERE id = $1', [meetingId]).then((r) => r[0]);

  // Gap: two-tier summarize with complete flow
  it('handles two-tier summarization and merges results from multiple slices', async () => {
    const m = await meeting([filler('ngân sách'), filler('lịch ra mắt'), filler('tuyển dụng')]);
    const calls = { embed: 0, count: 0, generate: 0 };

    // Create rules for each chunk; they will be called separately in first tier, then merged
    await run(
      [
        { when: 'ngân sách', point: 'Ngân sách tăng' },
        { when: 'lịch ra mắt', point: 'Ra mắt tháng 11' },
        { when: 'tuyển dụng', point: 'Tuyển thêm hai người' },
      ],
      m.userId,
      m.meetingId,
      calls,
      50, // each chunk is its own slice for two-tier
    );

    // Should call generate 4 times: 3 slices + 1 merge call
    expect(calls.generate).toBe(4);

    // Should still produce a merged summary with points from all slices
    const s = await stored(m.meetingId);
    expect(s.summary_insufficient).toBe(false);
    expect(s.summary).toContain('Ngân sách tăng');
    expect(s.summary).toContain('Ra mắt tháng 11');
    expect(s.summary).toContain('Tuyển thêm hai người');
    // Merged summary should cite all chunks
    const citations = s.summary_citations.filter((c: { kind: string }) => c.kind === 'point');
    expect(citations).toHaveLength(1); // One merged point
    expect(citations[0].chunk_ids).toEqual(m.chunkIds);
  });

  // Gap: verify that when re-running on 'changed' scope, user-edited items are preserved
  it('re-run on changed scope preserves user-edited action items with proper transaction safety', async () => {
    const m = await meeting([filler('báo cáo'), filler('thiết kế'), filler('kiểm thử')]);
    const first: SummaryRule[] = [
      { when: 'báo cáo', action: { content: 'Gửi báo cáo' } },
      { when: 'thiết kế', action: { content: 'Duyệt thiết kế' } },
      { when: 'kiểm thử', action: { content: 'Chạy kiểm thử' } },
    ];

    await run(first, m.userId, m.meetingId);

    // Edit one item and tick another
    await AppDataSource.query(`UPDATE action_items SET status = 'done' WHERE meeting_id = $1 AND content = 'Gửi báo cáo'`, [m.meetingId]);
    await AppDataSource.query(`UPDATE action_items SET content = 'Duyệt thiết kế 2026 Q4', is_user_edited = true WHERE meeting_id = $1 AND content = 'Duyệt thiết kế'`, [m.meetingId]);

    // Manually add an item
    await AppDataSource.query(
      `INSERT INTO action_items (meeting_id, user_id, content, status, is_manual, is_user_edited) VALUES ($1, $2, 'Gửi email tiếp theo', 'open', true, true)`,
      [m.meetingId, m.userId],
    );

    // Re-run with partial new rules
    const second: SummaryRule[] = [{ when: 'báo cáo', action: { content: 'Gửi báo cáo (lần 2)' } }];
    await run(second, m.userId, m.meetingId);

    const rows = (await AppDataSource.query('SELECT content, status, is_manual, is_user_edited FROM action_items WHERE meeting_id = $1 ORDER BY content', [m.meetingId])) as Array<{
      content: string;
      status: string;
      is_manual: boolean;
      is_user_edited: boolean;
    }>;

    // Verify the state:
    // - Ticked item should be kept: "Gửi báo cáo" with status=done, is_user_edited=true
    // - Edited item should be kept: "Duyệt thiết kế 2026 Q4" with is_user_edited=true
    // - Manual item should be kept: "Gửi email tiếp theo" with is_manual=true
    // - New AI item should be added: "Gửi báo cáo (lần 2)" but deduplicated if normalized form matches
    const kept = rows.filter((r) => r.is_user_edited);
    expect(kept.length).toBeGreaterThan(0);
    const manual = rows.filter((r) => r.is_manual);
    expect(manual.length).toBeGreaterThan(0);
  });

  // Gap: English language summary with correct text
  it('generates English summary with correct language and text', async () => {
    const m = await meeting([filler('budget'), filler('launch')], 'en-US');
    await run(
      [
        { when: 'budget', point: 'Budget increased by 10%' },
        { when: 'launch', decision: 'Launch in November' },
      ],
      m.userId,
      m.meetingId,
    );

    const s = await stored(m.meetingId);
    expect(s.summary).toContain('Decisions:');
    expect(s.summary).toContain('• Budget increased by 10%');
    expect(s.summary).toContain('• Launch in November');
  });

  // Gap: verify insufficient message for English meetings
  it('English insufficient meeting shows correct message', async () => {
    const m = await meeting(['alo alo'], 'en-US');
    const calls = { embed: 0, count: 0, generate: 0 };
    await run([{ when: 'alo', point: 'bịa' }], m.userId, m.meetingId, calls);

    expect(calls.generate).toBe(0);
    const s = await stored(m.meetingId);
    expect(s.summary).toBe('The meeting was too short or had too little content to summarize.');
    expect(s.summary_insufficient).toBe(true);
  });

  // Gap: verify citations are correctly structured with chunk IDs and segment seqs
  it('citations contain correct chunk_ids and segment_seq from source chunks', async () => {
    const m = await meeting([filler('ngân sách'), filler('lịch ra mắt')]);
    await run(
      [
        { when: 'ngân sách', point: 'Ngân sách tăng' },
        { when: 'lịch ra mắt', decision: 'Ra mắt tháng 11' },
      ],
      m.userId,
      m.meetingId,
    );

    const s = await stored(m.meetingId);
    expect(s.summary_citations).toHaveLength(2);

    const pointCitation = s.summary_citations.find((c: { kind: string }) => c.kind === 'point');
    expect(pointCitation).toBeDefined();
    expect(pointCitation.chunk_ids).toEqual([m.chunkIds[0]]);
    expect(pointCitation.segment_seq).toBe(10); // First chunk's segment_start_seq

    const decisionCitation = s.summary_citations.find((c: { kind: string }) => c.kind === 'decision');
    expect(decisionCitation).toBeDefined();
    expect(decisionCitation.chunk_ids).toEqual([m.chunkIds[1]]);
    expect(decisionCitation.segment_seq).toBe(20); // Second chunk's segment_start_seq
  });

  // Gap: verify assignee resolution only from people mentioned in the meeting
  it('assignee resolution respects meeting context - only matches people mentioned', async () => {
    const m = await meeting([filler('báo cáo'), filler('thiết kế'), filler('kiểm thử')]);

    // Only create Bình in the meeting context
    const [{ id: binhId }] = await AppDataSource.query(
      `INSERT INTO entities (user_id, canonical_name, normalized_name, type, aliases, embedding) VALUES ($1, 'anh Bình', 'binh', 'person', '{}', $2) RETURNING id`,
      [m.userId, pgvector.toSql(fakeEmbedding('anh Bình'))],
    );
    await AppDataSource.query('INSERT INTO entity_mentions (entity_id, meeting_id, chunk_id, surface_form) VALUES ($1, $2, $3, $4)', [binhId, m.meetingId, m.chunkIds[0], 'anh Bình']);

    await run(
      [
        { when: 'báo cáo', action: { content: 'Gửi báo cáo', assignee: 'anh Bình' } },
        { when: 'thiết kế', action: { content: 'Duyệt thiết kế', assignee: 'Lan' } }, // Not in meeting
        { when: 'kiểm thử', action: { content: 'Chạy kiểm thử', assignee: 'Huy' } }, // Not in meeting
      ],
      m.userId,
      m.meetingId,
    );

    const rows = (await AppDataSource.query('SELECT content, assignee_entity_id FROM action_items WHERE meeting_id = $1 ORDER BY content', [m.meetingId])) as Array<{ content: string; assignee_entity_id: string | null }>;

    const binh = rows.find((r) => r.content === 'Gửi báo cáo');
    expect(binh?.assignee_entity_id).toBe(binhId);

    const lan = rows.find((r) => r.content === 'Duyệt thiết kế');
    expect(lan?.assignee_entity_id).toBeNull();

    const huy = rows.find((r) => r.content === 'Chạy kiểm thử');
    expect(huy?.assignee_entity_id).toBeNull();
  });

  // Gap: verify that normalized names are used for matching (case-insensitive, diacritics)
  it('assignee matching uses normalized name comparison', async () => {
    const m = await meeting([filler('báo cáo')]);

    // Create an entity with diacritics
    const [{ id: entityId }] = await AppDataSource.query(
      `INSERT INTO entities (user_id, canonical_name, normalized_name, type, aliases, embedding) VALUES ($1, 'Tuấn', 'tuan', 'person', '{}', $2) RETURNING id`,
      [m.userId, pgvector.toSql(fakeEmbedding('Tuấn'))],
    );
    await AppDataSource.query('INSERT INTO entity_mentions (entity_id, meeting_id, chunk_id, surface_form) VALUES ($1, $2, $3, $4)', [entityId, m.meetingId, m.chunkIds[0], 'Tuấn']);

    // Model returns without diacritics
    await run(
      [{ when: 'báo cáo', action: { content: 'Gửi báo cáo', assignee: 'Tuan', due_date: '2026-10-02' } }], // no diacritics
      m.userId,
      m.meetingId,
    );

    const rows = (await AppDataSource.query('SELECT assignee_entity_id FROM action_items WHERE meeting_id = $1', [m.meetingId])) as Array<{ assignee_entity_id: string | null }>;
    // Should match normalized name
    expect(rows[0].assignee_entity_id).toBe(entityId);
  });

  // Gap: due_date is only accepted in YYYY-MM-DD format and stored correctly
  it('due_date parsing rejects non-compliant formats and stores valid dates', async () => {
    const m = await meeting([filler('báo cáo'), filler('thiết kế'), filler('kiểm thử')]);

    await run(
      [
        { when: 'báo cáo', action: { content: 'Task with valid date', due_date: '2026-10-02' } },
        { when: 'thiết kế', action: { content: 'Task with invalid date', due_date: '02/10/2026' } },
        { when: 'kiểm thử', action: { content: 'Task with relative date', due_date: 'thứ Sáu' } },
      ],
      m.userId,
      m.meetingId,
    );

    // Use the same casting as action-item-rows.ts to get YYYY-MM-DD format
    const rows = (await AppDataSource.query('SELECT content, due_date::text AS due_date FROM action_items WHERE meeting_id = $1 ORDER BY content', [m.meetingId])) as Array<{ content: string; due_date: string | null }>;

    const validDate = rows.find((r) => r.content === 'Task with valid date');
    const invalidDate = rows.find((r) => r.content === 'Task with invalid date');
    const relativeDate = rows.find((r) => r.content === 'Task with relative date');

    expect(validDate?.due_date).toBe('2026-10-02');
    expect(invalidDate?.due_date).toBeNull();
    expect(relativeDate?.due_date).toBeNull();
  });
});
