import { ConflictException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { ApiErrorCode, type AskResponse, type QaFilters, type QaHistoryResponse } from '@meetio/shared';
import { GeminiClient } from '../ai/gemini.client.js';
import { OwnershipViolationException } from '../common/exceptions/ownership-violation.exception.js';
import { Retriever, type QaScope } from './retriever.js';
import { buildContext } from './context-builder.js';
import { AnswerGenerator, type HistoryTurn } from './answer-generator.js';
import { readThread, type StoredCitation } from './qa-history.js';
import { aiErrorToHttp } from '../ai/ai-http-error.js';

/** Turns of conversation given to the model (a turn = question + answer). */
export const HISTORY_TURNS = 5;
const NOT_FOUND: Record<string, string> = {
  vi: 'Không tìm thấy thông tin này trong nội dung các cuộc họp.',
  en: 'I could not find this in your meetings.',
};
const EXCERPT = 200;
/** Vietnamese letters → answer the "not found" line in Vietnamese; otherwise English. */
const isVietnamese = (s: string) => /[ăâđêôơưàáảãạèéẻẽẹìíỉĩịòóỏõọùúủũụỳýỷỹỵ]/i.test(s);

/**
 * A date without a time ("2026-09-30", what the app's date filter sends) means that whole day in
 * Vietnam time — `to` includes meetings held on its day. A full timestamp is taken as given.
 */
export function dayBound(value: string | undefined, edge: 'start' | 'end'): Date | null {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(value);
  return new Date(`${value}T${edge === 'start' ? '00:00:00.000' : '23:59:59.999'}+07:00`);
}

@Injectable()
export class QaService {
  private readonly retriever: Retriever;
  private readonly generator: AnswerGenerator;
  private readonly minSimilarity: number;

  constructor(
    private readonly dataSource: DataSource,
    gemini: GeminiClient,
    config: ConfigService,
  ) {
    this.retriever = new Retriever(dataSource, gemini);
    this.generator = new AnswerGenerator(gemini);
    const t = Number(config.get<string>('QA_MIN_SIMILARITY'));
    this.minSimilarity = Number.isFinite(t) && t > 0 && t < 1 ? t : 0.6;
  }

  async askMeeting(userId: string, meetingId: string, question: string): Promise<AskResponse> {
    await this.assertMeetingReady(userId, meetingId);
    return this.ask({ userId, meetingId, from: null, to: null, entityId: null }, question, null);
  }

  async askGlobal(userId: string, question: string, from?: string, to?: string, entityId?: string): Promise<AskResponse> {
    let entityName: string | null = null;
    if (entityId) {
      const [e] = (await this.dataSource.query('SELECT canonical_name FROM entities WHERE id = $1 AND user_id = $2 AND merged_into_id IS NULL', [
        entityId,
        userId,
      ])) as { canonical_name: string }[];
      if (!e) throw new OwnershipViolationException(ApiErrorCode.NOT_FOUND, 'Không tìm thấy thực thể');
      entityName = e.canonical_name;
    }
    const filters: QaFilters = { from: from ?? null, to: to ?? null, entity_id: entityId ?? null, entity_name: entityName };
    const scope = { userId, meetingId: null, from: dayBound(from, 'start'), to: dayBound(to, 'end'), entityId: entityId ?? null };
    return this.ask(scope, question, from || to || entityId ? filters : null);
  }

  history(userId: string, meetingId: string | null, before?: string, limit?: number): Promise<QaHistoryResponse> {
    return readThread(this.dataSource, userId, meetingId, { before, limit });
  }

  async clear(userId: string, meetingId: string | null): Promise<void> {
    await this.dataSource.query('DELETE FROM qa_messages WHERE user_id = $1 AND meeting_id IS NOT DISTINCT FROM $2', [userId, meetingId]);
  }

  async assertOwnedMeeting(userId: string, meetingId: string): Promise<void> {
    const [m] = await this.dataSource.query('SELECT 1 FROM meetings WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL', [meetingId, userId]);
    if (!m) throw new OwnershipViolationException(ApiErrorCode.MEETING_NOT_FOUND, 'Không tìm thấy cuộc họp');
  }

  /** A meeting with nothing processed yet has nothing to answer from — say so instead of "not found". */
  private async assertMeetingReady(userId: string, meetingId: string): Promise<void> {
    await this.assertOwnedMeeting(userId, meetingId);
    const [ready] = await this.dataSource.query('SELECT 1 FROM meeting_chunks WHERE meeting_id = $1 AND embedding IS NOT NULL LIMIT 1', [meetingId]);
    if (!ready) {
      throw new ConflictException({ code: ApiErrorCode.MEETING_NOT_READY, message: 'Cuộc họp chưa được xử lý xong để hỏi đáp', details: {} });
    }
  }

  private async ask(scope: QaScope, question: string, filters: QaFilters | null): Promise<AskResponse> {
    try {
      return await this.answerAndStore(scope, question, filters);
    } catch (error) {
      throw aiErrorToHttp(error);
    }
  }

  private async answerAndStore(scope: QaScope, question: string, filters: QaFilters | null): Promise<AskResponse> {
    const signal = new AbortController().signal;
    const recent = (await readThread(this.dataSource, scope.userId, scope.meetingId, { limit: HISTORY_TURNS * 2 })).items;
    const history: HistoryTurn[] = recent.map((m) => ({ role: m.role, content: m.content }));
    const previousQuestion = [...recent].reverse().find((m) => m.role === 'user')?.content;
    // A follow-up ("còn việc kia thì sao?") is searched together with the question before it.
    const retrieval = await this.retriever.retrieve(scope, previousQuestion ? `${previousQuestion}\n${question}` : question, signal);

    let answer = { notFound: true, text: isVietnamese(question) ? NOT_FOUND.vi : NOT_FOUND.en, citations: [] as StoredCitation[], confidence: 0, tokens: 0 };
    // No passage close enough and no entity named: nothing to answer from — the model is not asked.
    if (retrieval.bestSimilarity >= this.minSimilarity || retrieval.namedEntities.length > 0) {
      const passages = buildContext(retrieval.chunks);
      const g = await this.generator.answer({ userId: scope.userId, meetingId: scope.meetingId, question, history, passages, signal });
      answer = {
        notFound: g.notFound,
        text: g.notFound ? g.answer || answer.text : g.answer,
        citations: g.cited.map((p) => ({
          chunk_id: p.id,
          meeting_id: p.meetingId,
          meeting_title: p.meetingTitle,
          meeting_date: p.meetingDate ? new Date(p.meetingDate).toISOString() : null,
          segment_seq: p.seq,
          excerpt: p.content.length > EXCERPT ? `${p.content.slice(0, EXCERPT)}…` : p.content,
        })),
        confidence: g.notFound ? 0 : g.confidence,
        tokens: g.tokens,
      };
    }

    const ids = await this.dataSource.transaction(async (m) => {
      const insert = (role: string, content: string, extra: unknown[]) =>
        m.query(
          `INSERT INTO qa_messages (user_id, meeting_id, role, content, citations, confidence, not_found, filters, tokens_used, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, clock_timestamp()) RETURNING id`,
          [scope.userId, scope.meetingId, role, content, ...extra],
        ) as Promise<{ id: string }[]>;
      const [q] = await insert('user', question, [null, null, false, filters ? JSON.stringify(filters) : null, null]);
      const [a] = await insert('assistant', answer.text, [JSON.stringify(answer.citations), answer.confidence, answer.notFound, null, answer.tokens]);
      return [q.id, a.id];
    });
    const { items } = await readThread(this.dataSource, scope.userId, scope.meetingId, { ids, limit: 2 });
    return { question: items[0], answer: items[1] };
  }
}
