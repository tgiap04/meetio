import type { DataSource } from 'typeorm';
import { ProcessingStep } from '@meetio/shared';
import { ExplainedStepError, type PipelineStepHandler, type StepContext } from '../pipeline/pipeline-step-handler.js';
import type { GeminiClient } from '../ai/gemini.client.js';
import { actionContentKey } from '../actions/action-item-rows.js';
import { SummaryGenerator, type GeneratedSummary } from './summary-generator.js';
import { SummarySchemaError } from './summary-schema.js';
import { resolveAssignee } from './assignee-resolver.js';

/** Fewer words than this is not a meeting to summarize (US-31) — no model call. */
export const MIN_SUMMARY_WORDS = 80;

const INSUFFICIENT: Record<string, string> = {
  vi: 'Cuộc họp quá ngắn hoặc không có đủ nội dung để tóm tắt.',
  en: 'The meeting was too short or had too little content to summarize.',
};
const DECISIONS_HEADING: Record<string, string> = { vi: 'Quyết định', en: 'Decisions' };
const pick = (table: Record<string, string>, lang: string) => table[lang.slice(0, 2).toLowerCase()] ?? table.en;

/**
 * Pipeline step `summarize` (phase 14): the whole transcript → cited summary + action items, in
 * one transaction so a retry never leaves half a result. Always the whole meeting, also on a
 * `changed` run. AI tasks nobody touched are replaced; tasks the user ticked, edited or added stay,
 * and a new task with the same content as a kept — or user-deleted — one is not added again
 * (clarifications 2026-09-26).
 */
export class SummarizeStepHandler implements PipelineStepHandler {
  readonly step = ProcessingStep.SUMMARIZE;
  private readonly generator: SummaryGenerator;

  constructor(
    private readonly dataSource: DataSource,
    gemini: GeminiClient,
    singlePassTokens = 60_000,
  ) {
    this.generator = new SummaryGenerator(gemini, singlePassTokens);
  }

  async run(ctx: StepContext): Promise<void> {
    const [meeting] = (await this.dataSource.query(`SELECT source_language, COALESCE(started_at, created_at) AS held_at FROM meetings WHERE id = $1`, [
      ctx.meetingId,
    ])) as { source_language: string; held_at: Date }[];
    if (!meeting) return;
    const chunks = (await this.dataSource.query(
      'SELECT id, content, segment_start_seq FROM meeting_chunks WHERE meeting_id = $1 ORDER BY segment_start_seq, id',
      [ctx.meetingId],
    )) as { id: string; content: string; segment_start_seq: number }[];

    const words = chunks.reduce((n, c) => n + c.content.split(/\s+/).filter(Boolean).length, 0);
    let result: GeneratedSummary = { insufficient: true, points: [], decisions: [], actions: [] };
    if (words >= MIN_SUMMARY_WORDS) {
      try {
        result = await this.generator.generate({
          userId: ctx.userId,
          meetingId: ctx.meetingId,
          sourceLanguage: meeting.source_language,
          meetingDate: new Date(meeting.held_at).toISOString().slice(0, 10),
          chunks,
          signal: ctx.signal,
        });
      } catch (error) {
        if (error instanceof SummarySchemaError) throw new ExplainedStepError('AI trả bản tóm tắt sai định dạng');
        throw error;
      }
    }
    if (ctx.signal.aborted) return;
    const insufficient = result.insufficient || (result.points.length === 0 && result.decisions.length === 0);
    await this.save(ctx, meeting.source_language, insufficient ? { ...result, points: [], decisions: [] } : result, insufficient, chunks);
  }

  private async save(
    ctx: StepContext,
    lang: string,
    result: GeneratedSummary,
    insufficient: boolean,
    chunks: { id: string; segment_start_seq: number }[],
  ): Promise<void> {
    const seq = (ids: string[]) => chunks.find((c) => c.id === ids[0])?.segment_start_seq ?? 0;
    const citations = [
      ...result.points.map((p) => ({ kind: 'point', text: p.text, chunk_ids: p.chunkIds, segment_seq: seq(p.chunkIds) })),
      ...result.decisions.map((d) => ({ kind: 'decision', text: d.text, chunk_ids: d.chunkIds, segment_seq: seq(d.chunkIds) })),
    ];
    const summary = insufficient
      ? pick(INSUFFICIENT, lang)
      : [
          ...result.points.map((p) => `• ${p.text}`),
          ...(result.decisions.length ? ['', `${pick(DECISIONS_HEADING, lang)}:`, ...result.decisions.map((d) => `• ${d.text}`)] : []),
        ].join('\n');

    await this.dataSource.transaction(async (m) => {
      await m.query('UPDATE meetings SET summary = $2, summary_citations = $3, summary_insufficient = $4, updated_at = now() WHERE id = $1', [
        ctx.meetingId,
        summary,
        JSON.stringify(citations),
        insufficient,
      ]);
      await m.query('DELETE FROM action_items WHERE meeting_id = $1 AND is_manual = false AND is_user_edited = false', [ctx.meetingId]);
      const kept = (await m.query('SELECT content FROM action_items WHERE meeting_id = $1', [ctx.meetingId])) as { content: string }[];
      const dismissed = (await m.query('SELECT content_key FROM action_item_dismissals WHERE meeting_id = $1', [ctx.meetingId])) as { content_key: string }[];
      // Neither a task the user kept nor one they deleted comes back as a new AI task.
      const seen = new Set([...kept.map((k) => actionContentKey(k.content)), ...dismissed.map((d) => d.content_key)]);
      for (const a of result.actions) {
        const key = actionContentKey(a.content);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        await m.query(
          `INSERT INTO action_items (meeting_id, user_id, content, assignee_entity_id, due_date, status, source_chunk_id, is_manual)
           VALUES ($1, $2, $3, $4, $5, 'open', $6, false)`,
          [ctx.meetingId, ctx.userId, a.content, await resolveAssignee(m, ctx.userId, ctx.meetingId, a.assignee), a.due_date, a.chunkId],
        );
      }
    });
  }
}
