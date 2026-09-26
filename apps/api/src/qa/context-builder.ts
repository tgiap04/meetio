import { estimateTokens } from '../chunking/chunker.js';
import type { RetrievedChunk } from './retriever.js';

export const CONTEXT_TOKEN_BUDGET = 6_000;

export interface ContextPassage extends RetrievedChunk {
  label: string;
}

const day = (d: Date | null) => (d ? new Date(d).toISOString().slice(0, 10) : 'không rõ ngày');

/**
 * Step 4: keep the most relevant passages that fit the budget, then present them in meeting and
 * transcript order — labelled S1..Sn with the meeting's name and date, so an answer can cite them
 * and a cross-meeting answer can tell the meetings apart (US-37).
 */
export function buildContext(chunks: RetrievedChunk[], budget = CONTEXT_TOKEN_BUDGET): ContextPassage[] {
  const kept: RetrievedChunk[] = [];
  let used = 0;
  for (const c of chunks) {
    const t = estimateTokens(c.content);
    if (used + t > budget && kept.length > 0) continue;
    kept.push(c);
    used += t;
  }
  return kept
    .sort((a, b) => (a.meetingDate?.valueOf() ?? 0) - (b.meetingDate?.valueOf() ?? 0) || a.meetingId.localeCompare(b.meetingId) || a.seq - b.seq)
    .map((c, i) => ({ ...c, label: `S${i + 1}` }));
}

export function renderContext(passages: ContextPassage[]): string {
  return passages.map((p) => `[${p.label}] (${p.meetingTitle} — ${day(p.meetingDate)})\n${p.content}`).join('\n\n');
}
