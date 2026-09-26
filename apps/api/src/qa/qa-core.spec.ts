import { buildContext } from './context-builder.js';
import { parseAnswer } from './answer-generator.js';
import { dayBound } from './qa.service.js';
import type { RetrievedChunk } from './retriever.js';

const chunk = (id: string, score: number, meetingDate: string, seq: number, words = 10): RetrievedChunk => ({
  id,
  meetingId: `m-${meetingDate}`,
  meetingTitle: `Họp ${meetingDate}`,
  meetingDate: new Date(meetingDate),
  seq,
  content: 'từ '.repeat(words).trim(),
  score,
  via: 'vector',
});

describe('buildContext', () => {
  it('keeps the most relevant passages within budget, then orders them by meeting date and seq', () => {
    const out = buildContext(
      [chunk('a', 0.9, '2026-09-20', 5), chunk('b', 0.8, '2026-09-10', 9), chunk('c', 0.7, '2026-09-20', 1), chunk('big', 0.6, '2026-09-01', 1, 5000)],
      100,
    );
    expect(out.map((p) => [p.id, p.label])).toEqual([
      ['b', 'S1'],
      ['c', 'S2'],
      ['a', 'S3'],
    ]);
  });

  it('always keeps the best passage even if it alone exceeds the budget', () => {
    expect(buildContext([chunk('big', 0.9, '2026-09-01', 1, 5000)], 10).map((p) => p.id)).toEqual(['big']);
  });
});

describe('parseAnswer', () => {
  const passages = buildContext([chunk('a', 0.9, '2026-09-20', 5), chunk('b', 0.8, '2026-09-21', 1)]);
  const reply = (o: Record<string, unknown>) => JSON.stringify({ not_found: false, answer: 'Bình phụ trách.', sources: [], confidence: 'high', ...o });

  it('maps cited labels back to passages and keeps the stated confidence', () => {
    const out = parseAnswer(reply({ sources: ['S2', 'S9'] }), passages)!;
    expect(out.cited.map((p) => p.id)).toEqual(['b']);
    expect(out.confidence).toBe(0.9);
  });

  it('drops to low confidence when no citation is valid (US-36)', () => {
    expect(parseAnswer(reply({ sources: ['S7'] }), passages)).toMatchObject({ cited: [], confidence: 0.3, notFound: false });
  });

  it('treats not_found or an empty answer as not found, with no citations', () => {
    expect(parseAnswer(reply({ not_found: true, sources: ['S1'] }), passages)).toMatchObject({ notFound: true, cited: [], confidence: 0 });
    expect(parseAnswer(reply({ answer: '  ' }), passages)).toMatchObject({ notFound: true });
  });

  it('rejects a malformed answer so the caller retries', () => {
    expect(parseAnswer('Câu trả lời là...', passages)).toBeNull();
    expect(parseAnswer(JSON.stringify({ answer: 'x' }), passages)).toBeNull();
  });
});

describe('dayBound', () => {
  it('reads a bare date as the whole day in Vietnam time, so "to" includes meetings held that day', () => {
    expect(dayBound('2026-09-30', 'start')!.toISOString()).toBe('2026-09-29T17:00:00.000Z');
    expect(dayBound('2026-09-30', 'end')!.toISOString()).toBe('2026-09-30T16:59:59.999Z');
    expect(dayBound('2026-09-30T10:00:00Z', 'end')!.toISOString()).toBe('2026-09-30T10:00:00.000Z');
    expect(dayBound(undefined, 'start')).toBeNull();
  });
});
