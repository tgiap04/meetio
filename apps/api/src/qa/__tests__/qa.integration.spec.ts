import { jest } from '@jest/globals';
import { randomUUID } from 'node:crypto';
import pgvector from 'pgvector/pg';
import { ConflictException, HttpException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { AppDataSource, registerPgVectorTypes } from '../../database/data-source.js';
import { chunkContentHash } from '../../chunking/chunker.js';
import { fakeGemini, fakeEmbedding } from '../../chunking/__tests__/fake-gemini.js';
import { QaService } from '../qa.service.js';
import { OwnershipViolationException } from '../../common/exceptions/ownership-violation.exception.js';

const maybeDescribe = process.env.DATABASE_URL ? describe : describe.skip;
const unit = (v: number[]) => {
  const n = Math.hypot(...v) || 1;
  return v.map((x) => x / n);
};
// The word-hashing fake embedding scores real matches ~0.5–0.6; the default (0.6) is calibrated against Gemini.
const config = { get: (k: string) => (k === 'QA_MIN_SIMILARITY' ? '0.3' : undefined) } as unknown as ConfigService;

/** Fake model: cites every passage containing `keyword`; "not found" when none does. Records prompts. */
function answering(keyword: string, prompts: string[]) {
  return (prompt: string) => {
    prompts.push(prompt);
    const labels = [...prompt.matchAll(/\[(S\d+)\] \([^)]*\)\n([^\n]*)/g)].filter((m) => m[2].includes(keyword)).map((m) => m[1]);
    return JSON.stringify(
      labels.length ? { not_found: false, answer: `Trả lời về ${keyword}`, sources: labels, confidence: 'high' } : { not_found: true, answer: '', sources: [], confidence: 'low' },
    );
  };
}

maybeDescribe('question answering (integration, real Postgres)', () => {
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

  async function user() {
    const id = randomUUID();
    users.push(id);
    await AppDataSource.query(`INSERT INTO users (id, email, display_name, password_hash) VALUES ($1, $2, 'Q', 'x')`, [id, `q-${id}@meetio.test`]);
    return id;
  }
  async function meeting(userId: string, title: string, date: string, texts: string[]) {
    const [{ id }] = await AppDataSource.query(
      `INSERT INTO meetings (user_id, title, status, source_language, started_at) VALUES ($1, $2, 'ready', 'vi-VN', $3) RETURNING id`,
      [userId, title, date],
    );
    const chunks: string[] = [];
    for (const [i, text] of texts.entries()) {
      const [c] = await AppDataSource.query(
        `INSERT INTO meeting_chunks (meeting_id, user_id, content, segment_start_seq, segment_end_seq, content_hash, embedding, token_count)
         VALUES ($1, $2, $3, $4, $4, $5, $6, 10) RETURNING id`,
        [id, userId, text, (i + 1) * 10, chunkContentHash((i + 1) * 10, (i + 1) * 10, text), pgvector.toSql(unit(fakeEmbedding(text)))],
      );
      chunks.push(c.id);
    }
    return { id: id as string, chunks };
  }
  async function entity(userId: string, name: string, normalized: string, mentions: { meetingId: string; chunkId: string }[]) {
    const [{ id }] = await AppDataSource.query(
      `INSERT INTO entities (user_id, canonical_name, normalized_name, type, aliases, embedding) VALUES ($1, $2, $3, 'project', '{}', $4) RETURNING id`,
      [userId, name, normalized, pgvector.toSql(unit(fakeEmbedding(name)))],
    );
    for (const m of mentions) {
      await AppDataSource.query('INSERT INTO entity_mentions (entity_id, meeting_id, chunk_id, surface_form) VALUES ($1, $2, $3, $4)', [id, m.meetingId, m.chunkId, name]);
    }
    return id as string;
  }
  const service = (keyword: string, prompts: string[], calls: Record<string, unknown> = {}) => {
    const c = { embed: 0, count: 0, generate: 0, ...calls };
    return { qa: new QaService(AppDataSource, fakeGemini(AppDataSource, c, answering(keyword, prompts)).client, config), calls: c };
  };

  it('answers from one meeting only, with citations that open the transcript at the passage', async () => {
    const u = await user();
    const a = await meeting(u, 'Sprint A', '2026-09-10T09:00:00Z', ['ngân sách quý bốn tăng mười phần trăm cho marketing', 'nhóm thiết kế nghỉ lễ']);
    await meeting(u, 'Sprint B', '2026-09-11T09:00:00Z', ['ngân sách quý bốn giảm mạnh cho hạ tầng']);
    const prompts: string[] = [];
    const { answer } = await service('ngân sách', prompts).qa.askMeeting(u, a.id, 'ngân sách quý bốn thế nào');
    expect(answer).toMatchObject({ role: 'assistant', not_found: false, low_confidence: false, confidence: 0.9 });
    expect(answer.citations).toEqual([
      expect.objectContaining({ chunk_id: a.chunks[0], meeting_id: a.id, meeting_title: 'Sprint A', segment_seq: 10, available: true }),
    ]);
    expect(prompts[0]).not.toContain('Sprint B');
  });

  it('never lets another user\'s meetings into the context', async () => {
    const [me, other] = [await user(), await user()];
    await meeting(me, 'Của tôi', '2026-09-10T09:00:00Z', ['ngân sách quý bốn tăng cho marketing']);
    await meeting(other, 'Của người khác', '2026-09-10T09:00:00Z', ['ngân sách quý bốn bí mật của công ty khác']);
    const prompts: string[] = [];
    const { answer } = await service('ngân sách', prompts).qa.askGlobal(me, 'ngân sách quý bốn');
    expect(prompts[0]).not.toContain('bí mật');
    expect(answer.citations.every((c) => c.meeting_title === 'Của tôi')).toBe(true);
  });

  it('says "not found" without calling the model when nothing relevant exists', async () => {
    const u = await user();
    await meeting(u, 'Sprint', '2026-09-10T09:00:00Z', ['ngân sách quý bốn tăng cho marketing']);
    const prompts: string[] = [];
    const { qa, calls } = service('ngân sách', prompts);
    const { answer } = await qa.askGlobal(u, 'thời tiết Hà Lan cuối tuần');
    expect(calls.generate).toBe(0);
    expect(answer).toMatchObject({ not_found: true, citations: [], confidence: 0, content: 'Không tìm thấy thông tin này trong nội dung các cuộc họp.' });
  });

  it('reaches passages through the graph when the question names an entity, citing several meetings', async () => {
    const u = await user();
    const m1 = await meeting(u, 'Kickoff', '2026-09-01T09:00:00Z', ['khởi động Phoenix với ba người']);
    const m2 = await meeting(u, 'Review', '2026-09-15T09:00:00Z', ['Phoenix trễ hai tuần vì thiếu người']);
    await entity(u, 'Phoenix', 'phoenix', [
      { meetingId: m1.id, chunkId: m1.chunks[0] },
      { meetingId: m2.id, chunkId: m2.chunks[0] },
    ]);
    const prompts: string[] = [];
    const { answer } = await service('Phoenix', prompts).qa.askGlobal(u, 'diễn tiến của phoenix?');
    expect(new Set(answer.citations.map((c) => c.meeting_title))).toEqual(new Set(['Kickoff', 'Review']));
    expect(prompts[0].indexOf('Kickoff')).toBeLessThan(prompts[0].indexOf('Review')); // meeting order
  });

  it('does not take "cuối tuần" for a person called Tuấn — but still matches a name typed without accents', async () => {
    const u = await user();
    const m = await meeting(u, 'Sprint', '2026-09-10T09:00:00Z', ['Tuấn phụ trách kiểm thử bản Android']);
    const [{ id: tuan }] = await AppDataSource.query(
      `INSERT INTO entities (user_id, canonical_name, normalized_name, type, aliases, embedding) VALUES ($1, 'Tuấn', 'tuan', 'person', '{}', $2) RETURNING id`,
      [u, pgvector.toSql(unit(fakeEmbedding('Tuấn')))],
    );
    await AppDataSource.query('INSERT INTO entity_mentions (entity_id, meeting_id, chunk_id, surface_form) VALUES ($1, $2, $3, $4)', [tuan, m.id, m.chunks[0], 'Tuấn']);
    const { qa, calls } = service('Tuấn', []);

    const weekend = await qa.askGlobal(u, 'thời tiết cuối tuần ra sao');
    expect(weekend.answer.not_found).toBe(true);
    expect(calls.generate).toBe(0); // gated before the model: no entity is named

    const typedPlain = await qa.askGlobal(u, 'tuan lam gi');
    expect(typedPlain.answer).toMatchObject({ not_found: false, citations: [expect.objectContaining({ chunk_id: m.chunks[0] })] });
  });

  it('limits a global question to one entity and one date range when asked, and remembers the filters', async () => {
    const u = await user();
    const early = await meeting(u, 'Tháng 8', '2026-08-05T09:00:00Z', ['Phoenix ngân sách ban đầu']);
    const late = await meeting(u, 'Tháng 9', '2026-09-05T09:00:00Z', ['Phoenix ngân sách điều chỉnh', 'Atlas ngân sách khác']);
    const phoenix = await entity(u, 'Phoenix', 'phoenix', [
      { meetingId: early.id, chunkId: early.chunks[0] },
      { meetingId: late.id, chunkId: late.chunks[0] },
    ]);
    const prompts: string[] = [];
    const { question, answer } = await service('ngân sách', prompts).qa.askGlobal(u, 'ngân sách', '2026-09-01T00:00:00Z', undefined, phoenix);
    expect(answer.citations.map((c) => c.chunk_id)).toEqual([late.chunks[0]]);
    expect(prompts[0]).not.toContain('Atlas');
    expect(question.filters).toEqual({ from: '2026-09-01T00:00:00Z', to: null, entity_id: phoenix, entity_name: 'Phoenix' });
  });

  it('understands a follow-up: searches with the previous question and gives the model the recent turns', async () => {
    const u = await user();
    const m = await meeting(u, 'Sprint', '2026-09-10T09:00:00Z', ['ngân sách quý bốn tăng cho marketing']);
    const prompts: string[] = [];
    const calls = { embedTexts: [] as string[] };
    const { qa } = service('ngân sách', prompts, calls);
    await qa.askMeeting(u, m.id, 'ngân sách quý bốn thế nào');
    await qa.askMeeting(u, m.id, 'còn cho marketing thì sao?');
    expect(calls.embedTexts[calls.embedTexts.length - 1]).toBe('ngân sách quý bốn thế nào\ncòn cho marketing thì sao?');
    expect(prompts[1]).toContain('Earlier conversation:\nUser: ngân sách quý bốn thế nào\nAssistant: Trả lời về ngân sách');
    const history = await qa.history(u, m.id);
    expect(history.items.map((i) => i.role)).toEqual(['user', 'assistant', 'user', 'assistant']);
  });

  it('marks a citation unavailable once its passage is re-cut, and refuses a meeting with nothing processed', async () => {
    const u = await user();
    const m = await meeting(u, 'Sprint', '2026-09-10T09:00:00Z', ['ngân sách quý bốn tăng cho marketing']);
    const { qa } = service('ngân sách', []);
    await qa.askMeeting(u, m.id, 'ngân sách quý bốn');
    await AppDataSource.query('DELETE FROM meeting_chunks WHERE meeting_id = $1', [m.id]);
    const [, answer] = (await qa.history(u, m.id)).items;
    expect(answer.citations[0]).toMatchObject({ meeting_title: 'Sprint', available: false });
    await expect(qa.askMeeting(u, m.id, 'ngân sách')).rejects.toBeInstanceOf(ConflictException);
  });

  it('answers 429 QUOTA_EXCEEDED once the user\'s monthly AI budget is spent', async () => {
    const u = await user();
    await meeting(u, 'Sprint', '2026-09-10T09:00:00Z', ['ngân sách quý bốn tăng cho marketing']);
    await AppDataSource.query('UPDATE users SET monthly_token_budget = 10 WHERE id = $1', [u]);
    await AppDataSource.query(
      `INSERT INTO usage_records (user_id, operation, model, input_tokens, output_tokens) VALUES ($1, 'qa', 'm', 10, 0)`,
      [u],
    );
    const err = await service('ngân sách', []).qa.askGlobal(u, 'ngân sách quý bốn').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HttpException);
    expect((err as HttpException).getStatus()).toBe(429);
    expect((err as HttpException).getResponse()).toMatchObject({ code: 'QUOTA_EXCEEDED' });
    expect((await service('ngân sách', []).qa.history(u, null)).items).toEqual([]); // nothing half-stored
  });

  it('paginates history with `before`, respecting the pagination cursor', async () => {
    const u = await user();
    const m = await meeting(u, 'Sprint', '2026-09-10T09:00:00Z', ['ngân sách quý bốn tăng cho marketing']);
    const { qa } = service('ngân sách', []);
    // Ask multiple questions to build history
    const q1 = await qa.askMeeting(u, m.id, 'câu hỏi một');
    const q2 = await qa.askMeeting(u, m.id, 'câu hỏi hai');
    const q3 = await qa.askMeeting(u, m.id, 'câu hỏi ba');
    // Get first page (most recent 2)
    const page1 = await qa.history(u, m.id, undefined, 2);
    expect(page1.items).toHaveLength(2);
    expect(page1.items[1].id).toBe(q3.answer.id);
    expect(page1.next_before).toBe(page1.items[0].id);
    // Get next page using cursor
    const page2 = await qa.history(u, m.id, page1.next_before ?? undefined, 2);
    expect(page2.items).toHaveLength(2);
    expect(page2.items[1].id).toBe(q2.answer.id);
    expect(page2.next_before).toBe(page2.items[0].id);
    // Last page
    const page3 = await qa.history(u, m.id, page2.next_before ?? undefined, 2);
    expect(page3.items).toHaveLength(2);
    expect(page3.items[1].id).toBe(q1.answer.id);
    expect(page3.next_before).toBeNull();
  });

  it('DELETE /meetings/:id/qa leaves other meetings\' threads intact', async () => {
    const u = await user();
    const m1 = await meeting(u, 'Sprint A', '2026-09-10T09:00:00Z', ['ngân sách quý bốn tăng cho marketing']);
    const m2 = await meeting(u, 'Sprint B', '2026-09-11T09:00:00Z', ['ngân sách quý bốn giảm mạnh']);
    const { qa } = service('ngân sách', []);
    await qa.askMeeting(u, m1.id, 'ngân sách quý bốn');
    await qa.askMeeting(u, m2.id, 'ngân sách quý bốn');
    const m1Before = await qa.history(u, m1.id);
    const m2Before = await qa.history(u, m2.id);
    expect(m1Before.items.length).toBeGreaterThan(0);
    expect(m2Before.items.length).toBeGreaterThan(0);
    await qa.clear(u, m1.id);
    const m1After = await qa.history(u, m1.id);
    const m2After = await qa.history(u, m2.id);
    expect(m1After.items).toHaveLength(0);
    expect(m2After.items.length).toBe(m2Before.items.length);
  });

  it('a meeting-scope question never draws graph-expanded chunks from other meetings', async () => {
    const u = await user();
    const m1 = await meeting(u, 'M1', '2026-09-10T09:00:00Z', ['Phoenix ngân sách ban đầu']);
    const m2 = await meeting(u, 'M2', '2026-09-11T09:00:00Z', ['Phoenix ngân sách điều chỉnh']);
    await entity(u, 'Phoenix', 'phoenix', [
      { meetingId: m1.id, chunkId: m1.chunks[0] },
      { meetingId: m2.id, chunkId: m2.chunks[0] },
    ]);
    const prompts: string[] = [];
    const { answer } = await service('Phoenix', prompts).qa.askMeeting(u, m1.id, 'Phoenix');
    // The answer can only cite m1's chunks
    expect(answer.citations.every((c) => c.meeting_id === m1.id)).toBe(true);
    // The prompt should not mention m2's meeting
    expect(prompts[0]).not.toContain('M2');
  });

  it('entity filter that names a merged-away entity returns not found', async () => {
    const u = await user();
    await meeting(u, 'Sprint', '2026-09-10T09:00:00Z', ['ngân sách quý bốn tăng cho marketing']);
    const [{ id: e1 }] = await AppDataSource.query(
      `INSERT INTO entities (user_id, canonical_name, normalized_name, type, aliases, embedding) VALUES ($1, 'E1', 'e1', 'topic', '{}', $2) RETURNING id`,
      [u, pgvector.toSql(unit(fakeEmbedding('E1')))],
    );
    const [{ id: e2 }] = await AppDataSource.query(
      `INSERT INTO entities (user_id, canonical_name, normalized_name, type, aliases, embedding) VALUES ($1, 'E2', 'e2', 'topic', '{}', $2) RETURNING id`,
      [u, pgvector.toSql(unit(fakeEmbedding('E2')))],
    );
    // e1 is merged into e2
    await AppDataSource.query('UPDATE entities SET merged_into_id = $1 WHERE id = $2', [e2, e1]);
    const { qa } = service('ngân sách', []);
    // Asking about e1 (merged away) should fail with OwnershipViolationException (404)
    await expect(qa.askGlobal(u, 'ngân sách', undefined, undefined, e1)).rejects.toBeInstanceOf(OwnershipViolationException);
  });

  it('retries an answer that fails the schema: two bad answers, then a good one', async () => {
    const u = await user();
    await meeting(u, 'Sprint', '2026-09-10T09:00:00Z', ['ngân sách quý bốn tăng cho marketing']);
    const replies = ['not even json', JSON.stringify({ not_found: false }), JSON.stringify({ not_found: false, answer: 'Trả lời thử', sources: ['S1'], confidence: 'high' })];
    const calls = { embed: 0, count: 0, generate: 0 };
    const qa = new QaService(AppDataSource, fakeGemini(AppDataSource, calls, () => replies[calls.generate - 1] ?? replies[2]).client, config);
    const { answer } = await qa.askGlobal(u, 'ngân sách quý bốn');
    expect(calls.generate).toBe(3);
    expect(answer).toMatchObject({ content: 'Trả lời thử', not_found: false, citations: [expect.objectContaining({ meeting_title: 'Sprint' })] });
  });

  it('gives up with 503 after three answers that fail the schema, storing nothing', async () => {
    const u = await user();
    await meeting(u, 'Sprint', '2026-09-10T09:00:00Z', ['ngân sách quý bốn tăng cho marketing']);
    const calls = { embed: 0, count: 0, generate: 0 };
    const qa = new QaService(AppDataSource, fakeGemini(AppDataSource, calls, () => 'không phải JSON').client, config);
    const err = await qa.askGlobal(u, 'ngân sách quý bốn').catch((e: unknown) => e);
    expect(calls.generate).toBe(3);
    expect((err as HttpException).getStatus()).toBe(503);
    expect((await qa.history(u, null)).items).toEqual([]);
  });

  it('answers with low_confidence when all citations are invalid (unknown labels)', async () => {
    const u = await user();
    const m = await meeting(u, 'Sprint', '2026-09-10T09:00:00Z', ['ngân sách quý bốn tăng cho marketing']);
    // A well-formed answer whose citations name passages that were never sent.
    const reply = JSON.stringify({ not_found: false, answer: 'Câu trả lời', sources: ['S99', 'S100'], confidence: 'high' });
    const qa = new QaService(AppDataSource, fakeGemini(AppDataSource, { embed: 0, count: 0, generate: 0 }, () => reply).client, config);
    const result = await qa.askMeeting(u, m.id, 'ngân sách');
    expect(result.answer).toMatchObject({ low_confidence: true, citations: [], not_found: false, confidence: 0.3 });
  });

  it('answers with English "not found" sentence when question is English', async () => {
    const u = await user();
    const m = await meeting(u, 'Sprint', '2026-09-10T09:00:00Z', ['some english content']);
    const { qa } = service('x', []);
    const result = await qa.askMeeting(u, m.id, 'What does the weather say?');
    expect(result.answer).toMatchObject({ not_found: true, content: 'I could not find this in your meetings.' });
  });

  it('answers with Vietnamese "not found" when question has Vietnamese diacritics', async () => {
    const u = await user();
    const m = await meeting(u, 'Sprint', '2026-09-10T09:00:00Z', ['nội dung tiếng Việt']);
    const { qa } = service('x', []);
    const result = await qa.askMeeting(u, m.id, 'Thời tiết thế nào?');
    expect(result.answer).toMatchObject({ not_found: true, content: 'Không tìm thấy thông tin này trong nội dung các cuộc họp.' });
  });
});
