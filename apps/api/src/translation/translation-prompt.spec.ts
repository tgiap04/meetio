import { buildTranslationRequest, parseTranslations } from './translation-prompt.js';

const items = [
  { seq: 4, text: 'xin chào' },
  { seq: 5, text: 'hẹn gặp lại' },
];

describe('buildTranslationRequest', () => {
  it('sends seq + text as JSON and names both languages', () => {
    const request = buildTranslationRequest(items, 'vi-VN', 'en-US');
    expect(JSON.parse(request.prompt)).toEqual(items);
    expect(request.systemInstruction).toContain('Vietnamese');
    expect(request.systemInstruction).toContain('English');
    expect(request.responseSchema).toMatchObject({ type: 'ARRAY' });
  });
});

describe('parseTranslations', () => {
  const parse = (raw: unknown) => parseTranslations(typeof raw === 'string' ? raw : JSON.stringify(raw), items);

  it('maps by seq, whatever order the model answered in', () => {
    const result = parse([
      { seq: 5, text: 'see you' },
      { seq: 4, text: 'hello' },
    ]);
    expect([...result]).toEqual([
      [5, 'see you'],
      [4, 'hello'],
    ]);
  });

  it('drops seqs that were not asked for, duplicates and blank texts', () => {
    const result = parse([
      { seq: 4, text: 'hello' },
      { seq: 4, text: 'again' },
      { seq: 99, text: 'stray' },
      { seq: 5, text: '   ' },
    ]);
    expect([...result]).toEqual([[4, 'hello']]);
  });

  it('returns nothing for non-JSON, a non-array or wrongly typed entries', () => {
    expect(parse('not json').size).toBe(0);
    expect(parse({ seq: 4, text: 'x' }).size).toBe(0);
    expect(parse([{ seq: '4', text: 'x' }, { seq: 5 }, null]).size).toBe(0);
  });
});
