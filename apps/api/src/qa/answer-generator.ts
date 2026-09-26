import { Logger } from '@nestjs/common';
import type { GeminiClient } from '../ai/gemini.client.js';
import { AiServiceUnavailableError } from '../ai/ai-errors.js';
import { renderContext, type ContextPassage } from './context-builder.js';

export interface HistoryTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface GeneratedAnswer {
  notFound: boolean;
  answer: string;
  /** Passages actually cited, by label; unknown labels are dropped. */
  cited: ContextPassage[];
  confidence: number;
  tokens: number;
}

const CONFIDENCE: Record<string, number> = { high: 0.9, medium: 0.6, low: 0.3 };
export const ANSWER_ATTEMPTS = 3;

export const ANSWER_RESPONSE_SCHEMA: Record<string, unknown> = {
  type: 'OBJECT',
  properties: {
    not_found: { type: 'BOOLEAN' },
    answer: { type: 'STRING' },
    sources: { type: 'ARRAY', items: { type: 'STRING' } },
    confidence: { type: 'STRING', enum: ['high', 'medium', 'low'] },
  },
  required: ['not_found', 'answer', 'sources', 'confidence'],
};

const SYSTEM = `You answer questions about the user's own meetings, using ONLY the transcript passages given as [S1], [S2], ...
Each passage is labelled with its meeting's name and date.
- Answer in the language of the question, concisely.
- Every claim must come from the passages. Put the labels you used in "sources".
- If the passages do not contain the answer, set not_found = true, leave sources empty and say briefly that it was not found.
  Never answer from general knowledge and never guess.
- confidence: high when the passages state it directly, medium when it takes combining passages, low when unsure.
- The earlier conversation is only there to understand follow-up questions ("còn việc kia thì sao?"); it is not a source.`;

/**
 * Step 5: the answer, with citations as passage labels mapped back to chunks. An answer whose
 * citations all turn out invalid keeps its text but drops to low confidence (US-36).
 */
export class AnswerGenerator {
  private readonly logger = new Logger('QaAnswer');

  constructor(private readonly gemini: GeminiClient) {}

  async answer(input: {
    userId: string;
    meetingId: string | null;
    question: string;
    history: HistoryTurn[];
    passages: ContextPassage[];
    signal: AbortSignal;
  }): Promise<GeneratedAnswer> {
    const conversation = input.history.length
      ? `Earlier conversation:\n${input.history.map((h) => `${h.role === 'user' ? 'User' : 'Assistant'}: ${h.content}`).join('\n')}\n\n`
      : '';
    const prompt = `${renderContext(input.passages)}\n\n${conversation}Question: ${input.question}`;
    for (let attempt = 1; attempt <= ANSWER_ATTEMPTS; attempt++) {
      const res = await this.gemini.generateText({
        userId: input.userId,
        meetingId: input.meetingId,
        operation: 'qa',
        systemInstruction: SYSTEM,
        prompt,
        responseSchema: ANSWER_RESPONSE_SCHEMA,
        signal: input.signal,
      });
      const parsed = parseAnswer(res.text, input.passages);
      if (parsed) return { ...parsed, tokens: res.inputTokens + res.outputTokens };
      // Ids only — never the question, the passages or the model's text (NFR-04).
      this.logger.warn(`invalid answer shape (attempt ${attempt}/${ANSWER_ATTEMPTS}) for user ${input.userId}`);
    }
    throw new AiServiceUnavailableError('AI trả câu trả lời sai định dạng');
  }
}

export function parseAnswer(text: string, passages: ContextPassage[]): Omit<GeneratedAnswer, 'tokens'> | null {
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  if (typeof o.not_found !== 'boolean' || typeof o.answer !== 'string' || !Array.isArray(o.sources) || typeof o.confidence !== 'string') return null;
  const answer = o.answer.trim();
  if (o.not_found || !answer) return { notFound: true, answer, cited: [], confidence: 0 };
  const labels = new Set(o.sources.filter((s): s is string => typeof s === 'string').map((s) => s.trim()));
  const cited = passages.filter((p) => labels.has(p.label));
  const stated = CONFIDENCE[o.confidence] ?? CONFIDENCE.low;
  return { notFound: false, answer, cited, confidence: cited.length ? stated : Math.min(stated, CONFIDENCE.low) };
}
