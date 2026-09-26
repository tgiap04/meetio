import { jest } from '@jest/globals';
import { AppDataSource, registerPgVectorTypes } from '../../database/data-source.js';
import { EXTRACT_ATTEMPTS } from '../extract-step.handler.js';
import { GraphKit, scriptedModel, type Rule } from './graph-test-kit.js';
import { EntityMergeService } from '../entity-merge.service.js';
import { EntityQueryService } from '../entity-query.service.js';

const mergeService = () => new EntityMergeService(AppDataSource, new EntityQueryService(AppDataSource));

const maybeDescribe = process.env.DATABASE_URL ? describe : describe.skip;

const ABC: Rule = {
  when: 'ABC',
  entities: [
    { name: 'Dự án ABC', type: 'project', description: 'dự án thanh toán' },
    { name: 'anh Bình', type: 'person' },
  ],
  relations: [{ source: 'Bình', target: 'Dự án ABC', relationship: 'phụ trách' }],
};

maybeDescribe('extract + resolve steps (integration, real Postgres)', () => {
  jest.setTimeout(30_000);
  const kits: GraphKit[] = [];
  const kit = (model = scriptedModel([ABC]), options?: ConstructorParameters<typeof GraphKit>[1]) => {
    const k = new GraphKit(model, options);
    kits.push(k);
    return k;
  };
  beforeAll(async () => {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
      await registerPgVectorTypes(AppDataSource);
    }
  });
  afterAll(async () => {
    for (const k of kits) await k.cleanup();
    await AppDataSource.destroy();
  });

  it('turns one project named in three meetings into one entity with three mentions', async () => {
    const k = kit(
      scriptedModel([
        ABC,
        { when: 'Bình chốt', entities: [{ name: 'Bình', type: 'person' }, { name: 'dự án abc', type: 'project' }] },
      ]),
    );
    const user = await k.user();
    for (const text of ['anh Bình báo cáo ABC', 'tiến độ ABC ổn', 'Bình chốt ngân sách']) {
      await k.process(user, await k.meeting(user, [text]));
    }

    const rows = await k.entities(user);
    expect(rows.map((r) => [r.canonical_name, r.mentions])).toEqual([
      ['anh Bình', 3],
      ['Dự án ABC', 3],
    ]);
    const [rel] = await AppDataSource.query(
      `SELECT r.relationship, r.chunk_id IS NOT NULL AS cited, s.canonical_name AS source FROM relations r JOIN entities s ON s.id = r.source_entity_id WHERE r.user_id = $1`,
      [user],
    );
    expect(rel).toEqual({ relationship: 'phụ trách', cited: true, source: 'anh Bình' });
  });

  it('skips only the group whose answers keep failing the schema, and the meeting carries on', async () => {
    const good = scriptedModel([ABC]);
    // The first group (chunks 0–3) always gets prose; groups run in parallel, so key on content, not call order.
    const k = kit((prompt) => (prompt.includes('đoạn 0 ') ? 'xin lỗi, đây là danh sách:' : good(prompt)));
    const user = await k.user();
    const texts = Array.from({ length: 5 }, (_, i) => `đoạn ${i} về ABC`); // groups of 4 + 1
    const meeting = await k.meeting(user, texts);

    await k.process(user, meeting);

    expect(k.calls.generate).toBe(EXTRACT_ATTEMPTS + 1);
    const chunks = await AppDataSource.query(
      'SELECT extraction IS NULL AS skipped, extracted_at IS NOT NULL AS extracted, resolved_at IS NOT NULL AS resolved FROM meeting_chunks WHERE meeting_id = $1 ORDER BY segment_start_seq',
      [meeting],
    );
    expect(chunks.map((c: { skipped: boolean }) => c.skipped)).toEqual([true, true, true, true, false]);
    expect(chunks.every((c: { extracted: boolean; resolved: boolean }) => c.extracted && c.resolved)).toBe(true);
    expect((await k.entities(user)).map((e) => e.mentions)).toEqual([1, 1]);
  });

  it('is a no-op when run again: no second mention, no second model call', async () => {
    const k = kit();
    const user = await k.user();
    const meeting = await k.meeting(user, ['họp về ABC']);
    await k.process(user, meeting);
    const calls = { ...k.calls };
    await k.process(user, meeting);

    expect(k.calls.generate).toBe(calls.generate);
    expect((await k.entities(user)).map((e) => e.mentions)).toEqual([1, 1]);
  });

  it('never overwrites a user-edited entity, but still records where it is mentioned', async () => {
    const k = kit();
    const user = await k.user();
    await k.process(user, await k.meeting(user, ['kickoff ABC']));
    const project = (await k.entities(user)).find((e) => e.type === 'project')!;
    await AppDataSource.query(`UPDATE entities SET canonical_name = 'ABC Payments', description = NULL, is_user_edited = true WHERE id = $1`, [project.id]);

    await k.process(user, await k.meeting(user, ['review ABC']));

    const after = (await k.entities(user)).find((e) => e.id === project.id)!;
    expect(after).toMatchObject({ canonical_name: 'ABC Payments', description: null, mentions: 2 });
  });

  it('only proposes a merge for a near-duplicate name — never merges it on its own', async () => {
    const k = kit(
      scriptedModel([
        { when: 'thanh toán', entities: [{ name: 'Dự án thanh toán ABC', type: 'project', description: 'dự án thanh toán ABC' }] },
        { when: 'payments', entities: [{ name: 'ABC thanh toán', type: 'project', description: 'dự án thanh toán ABC' }] },
      ]),
      { suggestThreshold: 0.6, autoMergeThreshold: null, maxSuggestions: 3 },
    );
    const user = await k.user();
    await k.process(user, await k.meeting(user, ['thanh toán']));
    await k.process(user, await k.meeting(user, ['payments']));

    const entities = await k.entities(user);
    expect(entities).toHaveLength(2); // not auto-merged
    const suggestions = await AppDataSource.query('SELECT entity_a_id, entity_b_id, score FROM entity_merge_suggestions WHERE user_id = $1', [user]);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].score).toBeGreaterThanOrEqual(0.6);
  });

  it('attaches a near-duplicate as an alias only when auto-merge is switched on', async () => {
    const k = kit(
      scriptedModel([
        { when: 'thanh toán', entities: [{ name: 'Dự án thanh toán ABC', type: 'project', description: 'dự án thanh toán ABC' }] },
        { when: 'payments', entities: [{ name: 'ABC thanh toán', type: 'project', description: 'dự án thanh toán ABC' }] },
      ]),
      { suggestThreshold: 0.6, autoMergeThreshold: 0.6, maxSuggestions: 3 },
    );
    const user = await k.user();
    await k.process(user, await k.meeting(user, ['thanh toán']));
    await k.process(user, await k.meeting(user, ['payments']));

    const entities = await k.entities(user);
    expect(entities).toHaveLength(1);
    expect(entities[0]).toMatchObject({ canonical_name: 'Dự án thanh toán ABC', aliases: ['ABC thanh toán'], mentions: 2 });
  });

  it('removes entities left without any mention once their chunks are re-cut, unless the user edited them', async () => {
    const k = kit(
      scriptedModel([
        { when: 'Lan', entities: [{ name: 'Lan', type: 'person' }] },
        { when: 'Mai', entities: [{ name: 'Mai', type: 'person' }] },
      ]),
    );
    const user = await k.user();
    const meeting = await k.meeting(user, ['chị Lan', 'chị Mai']);
    await k.process(user, meeting);
    await AppDataSource.query(`UPDATE entities SET is_user_edited = true WHERE user_id = $1 AND canonical_name = 'Mai'`, [user]);
    await AppDataSource.query('DELETE FROM meeting_chunks WHERE meeting_id = $1', [meeting]); // an edit re-cut every chunk

    await k.process(user, meeting);

    expect((await k.entities(user)).map((e) => e.canonical_name)).toEqual(['Mai']);
  });

  it('merge drops relations that would become self-loops and undo puts them back, with the mentions', async () => {
    const k = kit(
      scriptedModel([
        { when: 'cùng', entities: [{ name: 'Lan', type: 'person' }, { name: 'chị Mai', type: 'person' }], relations: [{ source: 'Lan', target: 'Mai', relationship: 'làm cùng' }] },
      ]),
    );
    const user = await k.user();
    await k.process(user, await k.meeting(user, ['Lan làm cùng chị Mai']));
    const all = await k.entities(user);
    const [lan, mai] = ['Lan', 'chị Mai'].map((n) => all.find((e) => e.canonical_name === n)!);
    const [rel] = await AppDataSource.query('SELECT id FROM relations WHERE user_id = $1', [user]);

    const { merges } = await mergeService().merge(user, lan.id, [mai.id]);
    expect(await AppDataSource.query('SELECT id FROM relations WHERE user_id = $1', [user])).toEqual([]);
    expect((await k.entities(user)).find((e) => e.id === lan.id)).toMatchObject({ mentions: 2, aliases: ['chị Mai'] });

    const detail = await mergeService().undo(user, merges[0].id);
    expect(detail).toMatchObject({ id: lan.id, aliases: [], mention_count: 1 });
    expect(detail.relations).toEqual([expect.objectContaining({ id: rel.id, direction: 'outgoing', relationship: 'làm cùng' })]);
    expect((await k.entities(user)).find((e) => e.id === mai.id)).toMatchObject({ merged_into_id: null, mentions: 1 });
  });

  it('merging an entity that already absorbed another carries it along, and undo hands it back', async () => {
    const k = kit(
      scriptedModel([
        { when: 'một', entities: [{ name: 'Anh Một', type: 'topic' }] },
        { when: 'hai', entities: [{ name: 'Hai', type: 'topic' }] },
        { when: 'ba', entities: [{ name: 'Ba', type: 'topic' }] },
      ]),
    );
    const user = await k.user();
    for (const t of ['một', 'hai', 'ba']) await k.process(user, await k.meeting(user, [t]));
    const byName = async (n: string) => (await k.entities(user)).find((e) => e.canonical_name === n)!;
    const [one, two, three] = [await byName('Anh Một'), await byName('Hai'), await byName('Ba')];

    await mergeService().merge(user, two.id, [three.id]); // Ba → Hai
    const { merges } = await mergeService().merge(user, one.id, [two.id]); // Hai (with Ba) → Anh Một
    expect(await byName('Ba')).toMatchObject({ merged_into_id: one.id }); // flattened
    expect(await byName('Anh Một')).toMatchObject({ mentions: 3, aliases: ['Hai', 'Ba'] });

    await mergeService().undo(user, merges[0].id);
    expect(await byName('Hai')).toMatchObject({ merged_into_id: null, mentions: 2, aliases: ['Ba'] });
    expect(await byName('Ba')).toMatchObject({ merged_into_id: two.id });
    expect(await byName('Anh Một')).toMatchObject({ mentions: 1, aliases: [] });
  });

  it('two meetings resolving the same new name at the same time produce one entity (graph lock)', async () => {
    const k = kit(scriptedModel([{ when: 'Bình', entities: [{ name: 'anh Bình', type: 'person' }] }]));
    const user = await k.user();
    const meetings = await Promise.all(Array.from({ length: 4 }, (_, i) => k.meeting(user, [`Bình báo cáo lần ${i}`])));

    // Every run embeds the name as new (tier 1 misses outside the lock); only the lock stops four inserts.
    await Promise.all(meetings.map((m) => k.process(user, m)));

    expect((await k.entities(user)).map((e) => [e.canonical_name, e.mentions])).toEqual([['anh Bình', 4]]);
  });
});
