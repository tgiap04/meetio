import { ExtractionSchemaError, parseExtraction } from './extraction-schema.js';

const answer = (o: unknown) => JSON.stringify(o);

describe('parseExtraction', () => {
  it('splits entities and relations per cited chunk', () => {
    const out = parseExtraction(
      answer({
        entities: [
          { name: 'anh Bình', type: 'person', description: 'PM', chunks: ['C1', 'C2'] },
          { name: 'Dự án ABC', type: 'project', chunks: ['C1'] },
        ],
        relations: [{ source: 'Bình', target: 'Dự án ABC', relationship: 'phụ trách', confidence: 0.9, chunk: 'C1' }],
      }),
      ['C1', 'C2'],
    );
    expect(out.get('C1')!.entities.map((e) => e.name)).toEqual(['anh Bình', 'Dự án ABC']);
    expect(out.get('C2')!.entities).toEqual([{ name: 'anh Bình', type: 'person', description: 'PM' }]);
    expect(out.get('C1')!.relations).toEqual([{ source: 'anh Bình', target: 'Dự án ABC', relationship: 'phụ trách', confidence: 0.9 }]);
    expect(out.get('C2')!.relations).toEqual([]);
  });

  it('drops what the model cannot back up instead of failing the batch', () => {
    const out = parseExtraction(
      answer({
        entities: [
          { name: 'Lan', type: 'person', chunks: ['C9'] }, // label never sent
          { name: 'Mai', type: 'person', chunks: ['C1'] },
          { name: 'API', type: 'product', chunks: ['C2'] },
        ],
        relations: [
          { source: 'Mai', target: 'API', relationship: 'làm', confidence: 0.8, chunk: 'C1' }, // API is not in C1
          { source: 'Mai', target: 'Mai', relationship: 'tự', confidence: 0.8, chunk: 'C1' }, // self loop
          { source: 'Mai', target: 'Lan', relationship: 'gặp', confidence: 2, chunk: 'C7' },
        ],
      }),
      ['C1', 'C2'],
    );
    expect(out.get('C1')).toEqual({ entities: [{ name: 'Mai', type: 'person', description: null }], relations: [] });
    expect(out.get('C2')!.entities.map((e) => e.name)).toEqual(['API']);
  });

  it('clamps confidence into 0..1 and de-duplicates names within a chunk', () => {
    const out = parseExtraction(
      answer({
        entities: [
          { name: 'Bình', type: 'person', chunks: ['C1'] },
          { name: 'anh Bình', type: 'person', chunks: ['C1'] },
          { name: 'ABC', type: 'project', chunks: ['C1'] },
        ],
        relations: [{ source: 'Bình', target: 'ABC', relationship: 'lead', confidence: 3, chunk: 'C1' }],
      }),
      ['C1'],
    );
    expect(out.get('C1')!.entities.map((e) => e.name)).toEqual(['Bình', 'ABC']);
    expect(out.get('C1')!.relations[0].confidence).toBe(1);
  });

  it.each([
    ['not JSON', 'Here are the entities: ...'],
    ['missing arrays', answer({ entities: [] })],
    ['unknown entity type', answer({ entities: [{ name: 'X', type: 'task', chunks: ['C1'] }], relations: [] })],
    ['non-numeric confidence', answer({ entities: [], relations: [{ source: 'a', target: 'b', relationship: 'r', confidence: 'high', chunk: 'C1' }] })],
    ['chunks not an array', answer({ entities: [{ name: 'X', type: 'person', chunks: 'C1' }], relations: [] })],
  ])('rejects a structurally wrong answer (%s) so the caller retries', (_case, text) => {
    expect(() => parseExtraction(text, ['C1'])).toThrow(ExtractionSchemaError);
  });
});
