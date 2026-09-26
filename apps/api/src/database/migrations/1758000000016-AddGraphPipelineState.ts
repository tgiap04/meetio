import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 13: graph extraction and entity resolution.
 *
 * - `meeting_chunks.extraction / extracted_at / resolved_at` hold each chunk's
 *   progress through the `extract` and `resolve` steps. A retry resumes at the
 *   first unfinished chunk, and a `changed` re-run only touches the chunks the
 *   chunk step re-created (new hash → new row → no marks). `extracted_at` with
 *   a NULL `extraction` means the model's output never passed validation and
 *   the chunk was skipped.
 * - `entities.normalized_aliases` lets tier-1 matching find an entity by any
 *   name it was merged from or renamed from.
 * - `entity_merge_suggestions` holds pairs the vector tier flagged for review;
 *   the pair is stored ordered (a < b) so it exists at most once.
 * - `entity_merges` remembers what a merge moved, so it can be undone for 30
 *   days (US-40).
 */
export class AddGraphPipelineState1758000000016 implements MigrationInterface {
  name = 'AddGraphPipelineState1758000000016';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE meeting_chunks
        ADD COLUMN extraction jsonb,
        ADD COLUMN extracted_at timestamptz,
        ADD COLUMN resolved_at timestamptz`);

    await queryRunner.query(`ALTER TABLE entities ADD COLUMN normalized_aliases text[] NOT NULL DEFAULT '{}'`);
    await queryRunner.query('CREATE INDEX idx_entities_normalized_aliases ON entities USING gin (normalized_aliases)');

    await queryRunner.query(`
      CREATE TABLE entity_merge_suggestions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        entity_a_id uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
        entity_b_id uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
        score real NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT chk_merge_suggestion_ordered CHECK (entity_a_id < entity_b_id),
        CONSTRAINT uq_merge_suggestion_pair UNIQUE (user_id, entity_a_id, entity_b_id)
      )`);
    await queryRunner.query('CREATE INDEX idx_merge_suggestions_entity_b ON entity_merge_suggestions (entity_b_id)');

    await queryRunner.query(`
      CREATE TABLE entity_merges (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        keep_id uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
        merged_id uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
        snapshot jsonb NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        undone_at timestamptz
      )`);
    await queryRunner.query('CREATE INDEX idx_entity_merges_keep ON entity_merges (keep_id, created_at)');
    await queryRunner.query('CREATE INDEX idx_entity_merges_merged ON entity_merges (merged_id)');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE entity_merges');
    await queryRunner.query('DROP TABLE entity_merge_suggestions');
    await queryRunner.query('DROP INDEX idx_entities_normalized_aliases');
    await queryRunner.query('ALTER TABLE entities DROP COLUMN normalized_aliases');
    await queryRunner.query('ALTER TABLE meeting_chunks DROP COLUMN resolved_at, DROP COLUMN extracted_at, DROP COLUMN extraction');
  }
}
