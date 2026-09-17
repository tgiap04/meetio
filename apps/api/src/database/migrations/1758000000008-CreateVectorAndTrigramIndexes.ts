import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The 3 indexes TypeORM's decorator/Table-API DSL genuinely cannot express
 * (see phase-02-database-schema.md's DSL table):
 *   - HNSW on meeting_chunks.embedding  — TableIndexTypes has no "hnsw"
 *   - HNSW on entities.embedding        — same
 *   - GIN trigram on the EXPRESSION unaccent(lower(title)) — TypeORM
 *     supports neither expression indexes nor opclasses
 *
 * `m=16, ef_construction=64` per phase-02's risk table — measure before
 * retuning, don't guess.
 *
 * Postgres refuses an expression index whose function isn't IMMUTABLE, and
 * `unaccent(text)` is only STABLE (it depends on the search_path-resolved
 * default text search dictionary). The standard, documented workaround
 * (postgresql.org's own unaccent docs) is a thin SQL wrapper that pins the
 * dictionary explicitly via `unaccent(regdictionary, text)`, which has no
 * such dependency and can be marked IMMUTABLE safely.
 */
export class CreateVectorAndTrigramIndexes1758000000008 implements MigrationInterface {
  name = 'CreateVectorAndTrigramIndexes1758000000008';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX idx_chunks_embedding ON meeting_chunks
         USING hnsw (embedding vector_cosine_ops)
         WITH (m = 16, ef_construction = 64)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_entities_embedding ON entities
         USING hnsw (embedding vector_cosine_ops)
         WITH (m = 16, ef_construction = 64)`,
    );
    await queryRunner.query(
      `CREATE OR REPLACE FUNCTION immutable_unaccent(text)
         RETURNS text
         LANGUAGE sql
         IMMUTABLE PARALLEL SAFE STRICT
         AS $$ SELECT unaccent('unaccent', $1) $$`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_meetings_title_trgm ON meetings
         USING gin (immutable_unaccent(lower(title)) gin_trgm_ops)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS idx_meetings_title_trgm');
    await queryRunner.query('DROP FUNCTION IF EXISTS immutable_unaccent(text)');
    await queryRunner.query('DROP INDEX IF EXISTS idx_entities_embedding');
    await queryRunner.query('DROP INDEX IF EXISTS idx_chunks_embedding');
  }
}
