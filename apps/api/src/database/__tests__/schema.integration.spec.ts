import { performance } from 'node:perf_hooks';
import { AppDataSource, registerPgVectorTypes } from '../data-source.js';
import { User } from '../entities/user.entity.js';
import { Meeting } from '../entities/meeting.entity.js';
import { TranscriptSegment } from '../entities/transcript-segment.entity.js';
import { MeetingChunk } from '../entities/meeting-chunk.entity.js';
import { EntityRecord } from '../entities/entity-record.entity.js';
import { EntityMention } from '../entities/entity-mention.entity.js';
import { VectorRepository } from '../vector.repository.js';
import { MeetingStatus } from '../enums/meeting-status.enum.js';
import { EntityType } from '../enums/entity-type.enum.js';

/**
 * Runs against the real Postgres started by `make up` — no mocks, per
 * phase-02-database-schema.md.
 *
 * Skips when `DATABASE_URL` is unset, so `yarn test` still works for the rest
 * of the suite without a database configured.
 *
 * A `DATABASE_URL` that is set but unreachable deliberately FAILS rather than
 * skips. Saying where the database is and being wrong is a real problem: in CI
 * it would mean the service container never came up, and silently skipping
 * would turn that into a green build that tested nothing.
 *
 * The guard only works because `data-source.ts` no longer throws while being
 * imported — it used to, which made this suite fail before `describe.skip`
 * could run at all.
 */
const hasDb = Boolean(process.env.DATABASE_URL);
const maybeDescribe = hasDb ? describe : describe.skip;

function randomEmbedding(): number[] {
  return Array.from({ length: 768 }, () => Math.random() * 2 - 1);
}

maybeDescribe('database schema (integration, real Postgres)', () => {
  let userId: string;

  beforeAll(async () => {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
      await registerPgVectorTypes(AppDataSource);
    }
    const user = await AppDataSource.getRepository(User).save({
      email: `schema-test-${Date.now()}@example.com`,
      password_hash: 'not-a-real-hash',
      display_name: 'Schema Test User',
      notification_settings: {},
    });
    userId = user.id;
  });

  afterAll(async () => {
    await AppDataSource.getRepository(User).delete({ id: userId });
    await AppDataSource.destroy();
  });

  it('rejects a duplicate (meeting_id, seq) transcript segment', async () => {
    const meeting = await AppDataSource.getRepository(Meeting).save({
      user_id: userId,
      title: 'Unique constraint test meeting',
      status: MeetingStatus.READY,
      source_language: 'vi-VN',
    });
    const segments = AppDataSource.getRepository(TranscriptSegment);
    await segments.save({ meeting_id: meeting.id, seq: 0, text: 'first', started_at_ms: 0, ended_at_ms: 100 });

    await expect(
      segments.save({ meeting_id: meeting.id, seq: 0, text: 'duplicate resend', started_at_ms: 0, ended_at_ms: 100 }),
    ).rejects.toThrow(/duplicate key value/i);
  });

  it('cascades meeting deletion to children but leaves the user-scoped entity intact', async () => {
    const meeting = await AppDataSource.getRepository(Meeting).save({
      user_id: userId,
      title: 'Cascade test meeting',
      status: MeetingStatus.READY,
      source_language: 'vi-VN',
    });
    const chunk = await AppDataSource.getRepository(MeetingChunk).save({
      meeting_id: meeting.id,
      user_id: userId,
      content: 'chunk for cascade test',
      segment_start_seq: 0,
      segment_end_seq: 0,
      token_count: 5,
      embedding: randomEmbedding(),
    });
    const entity = await AppDataSource.getRepository(EntityRecord).save({
      user_id: userId,
      canonical_name: 'Cascade Test Entity',
      normalized_name: 'cascade test entity',
      type: EntityType.TOPIC,
      aliases: [],
      embedding: randomEmbedding(),
      is_user_edited: false,
    });
    await AppDataSource.getRepository(EntityMention).save({
      entity_id: entity.id,
      meeting_id: meeting.id,
      chunk_id: chunk.id,
      surface_form: 'Cascade Test Entity',
    });

    await AppDataSource.getRepository(Meeting).delete({ id: meeting.id });

    const remainingChunks = await AppDataSource.getRepository(MeetingChunk).count({ where: { meeting_id: meeting.id } });
    const remainingMentions = await AppDataSource.getRepository(EntityMention).count({ where: { meeting_id: meeting.id } });
    const entityStillExists = await AppDataSource.getRepository(EntityRecord).findOne({ where: { id: entity.id } });

    expect(remainingChunks).toBe(0);
    expect(remainingMentions).toBe(0);
    expect(entityStillExists).not.toBeNull();
  });

  it('answers a cosine similarity search over 10,000 chunks in under 100ms via the HNSW index', async () => {
    const meeting = await AppDataSource.getRepository(Meeting).save({
      user_id: userId,
      title: 'Vector perf test meeting',
      status: MeetingStatus.READY,
      source_language: 'vi-VN',
    });

    await AppDataSource.query(
      `INSERT INTO meeting_chunks (meeting_id, user_id, content, segment_start_seq, segment_end_seq, token_count, embedding)
       SELECT $1, $2, 'synthetic chunk ' || gs, 0, 0, 10,
              (SELECT ('[' || string_agg(round((random() * 2 - 1)::numeric, 4)::text, ',') || ']')::vector
               FROM generate_series(1, 768))
       FROM generate_series(1, 10000) AS gs`,
      [meeting.id, userId],
    );

    const vectorRepository = new VectorRepository(AppDataSource);
    const started = performance.now();
    const results = await vectorRepository.findSimilarChunks(userId, randomEmbedding(), 10);
    const elapsedMs = performance.now() - started;

    // eslint-disable-next-line no-console
    console.log(`Vector similarity search over 10,000 chunks took ${elapsedMs.toFixed(2)}ms`);

    expect(results).toHaveLength(10);
    expect(elapsedMs).toBeLessThan(100);
  }, 30000);

  it('refuses to revert migration 010 while a Google-only account exists', async () => {
    const googleOnlyUser = await AppDataSource.getRepository(User).save({
      email: `schema-test-google-only-${Date.now()}@example.com`,
      password_hash: null,
      google_sub: `schema-test-google-sub-${Date.now()}`,
      display_name: 'Google Only Schema Test User',
      notification_settings: {},
    });

    try {
      await expect(AppDataSource.undoLastMigration()).rejects.toThrow(/Google-only account/);

      // The rejected down() must not have left the schema half-reverted —
      // the CHECK constraint from migration 010 should still be in place.
      const constraints = await AppDataSource.query(
        `SELECT conname FROM pg_constraint WHERE conname = 'chk_users_has_credential'`,
      );
      expect(constraints).toHaveLength(1);
    } finally {
      await AppDataSource.getRepository(User).delete({ id: googleOnlyUser.id });
    }
  });

  it('reverts the last migration and reapplies it without losing existing data', async () => {
    const usersBefore = await AppDataSource.getRepository(User).count();

    await AppDataSource.undoLastMigration();
    const usersDuringRevert = await AppDataSource.getRepository(User).count();
    expect(usersDuringRevert).toBe(usersBefore);

    const applied = await AppDataSource.runMigrations();
    expect(applied.length).toBeGreaterThan(0);

    const usersAfter = await AppDataSource.getRepository(User).count();
    expect(usersAfter).toBe(usersBefore);

    const restoredIndexes = await AppDataSource.query(
      `SELECT indexname FROM pg_indexes
       WHERE indexname IN ('idx_chunks_embedding', 'idx_entities_embedding', 'idx_meetings_title_trgm')`,
    );
    expect(restoredIndexes).toHaveLength(3);
  }, 30000);
});
