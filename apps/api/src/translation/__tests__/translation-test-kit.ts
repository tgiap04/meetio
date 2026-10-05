import { jest } from '@jest/globals';
import type { ConfigService } from '@nestjs/config';
import type { GeminiClient, GenerateRequest } from '../../ai/gemini.client.js';
import type { MeetingRoomNotifier } from '../../realtime/meeting-room.notifier.js';
import { TranslationService } from '../translation.service.js';
import type { StoredSegment, TranslationStore, TranslationTarget } from '../translation-store.js';

export const M = 'meeting-1';
export const target: TranslationTarget = { userId: 'u1', sourceLanguage: 'vi-VN', translateTo: 'en-US' };

/** In-memory stand-in for the tables the store reads and writes. */
export function fakeStore(initial: TranslationTarget | null = target) {
  const rows = new Map<number, StoredSegment>();
  const store = {
    meeting: initial,
    rows,
    targetFor: jest.fn(async (_id: string, userId?: string) => (store.meeting && (!userId || userId === store.meeting.userId) ? store.meeting : null)),
    untranslated: jest.fn(async (_id: string, seqs: readonly number[]) =>
      seqs.filter((s) => rows.has(s) && rows.get(s)!.translatedText === null).map((seq) => ({ seq, text: rows.get(seq)!.text }))),
    segment: jest.fn(async (_id: string, seq: number) => rows.get(seq) ?? null),
    saveTranslation: jest.fn(async (_id: string, seq: number, text: string, to: string) => {
      const row = rows.get(seq);
      // Same rule as the SQL: an untranslated row, or one translated into a language the meeting no longer wants.
      if (!row || (row.translatedText !== null && row.translatedTo === to)) return false;
      row.translatedText = text;
      row.translatedTo = to;
      return true;
    }),
  };
  return store;
}

export const answer = (pairs: [number, string][]) => ({
  text: JSON.stringify(pairs.map(([seq, text]) => ({ seq, text }))),
  inputTokens: 1,
  outputTokens: 1,
});
export const seqsIn = (request: GenerateRequest) => (JSON.parse(request.prompt) as { seq: number }[]).map((i) => i.seq);
/** Default model: translates every seq asked for. */
export const echoModel = (request: GenerateRequest) => answer(seqsIn(request).map((s) => [s, `en${s}`]));

export function setup(model: (r: GenerateRequest) => unknown = echoModel, store = fakeStore(), env: Record<string, string> = { TRANSLATION_BATCH_WINDOW_MS: '2000', TRANSLATION_BATCH_MAX: '5' }) {
  const calls: number[][] = [];
  const requests: GenerateRequest[] = [];
  const generateText = jest.fn(async (request: GenerateRequest) => {
    calls.push(seqsIn(request));
    requests.push(request);
    return model(request) as Awaited<ReturnType<GeminiClient['generateText']>>;
  });
  const notifier = {
    segmentTranslated: jest.fn(),
    segmentTranslationFailed: jest.fn(),
  };
  const config = { get: (key: string) => env[key] } as unknown as ConfigService;
  const service = new TranslationService(store as unknown as TranslationStore, { generateText } as unknown as GeminiClient, notifier as unknown as MeetingRoomNotifier, config);
  for (let seq = 1; seq <= 12; seq++) store.rows.set(seq, { text: `vi${seq}`, translatedText: null, translatedTo: null });
  return { service, store, calls, requests, generateText, notifier };
}

export const settle = () => jest.advanceTimersByTimeAsync(2100);
