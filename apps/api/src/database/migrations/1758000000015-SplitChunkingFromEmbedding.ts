import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 12 runs chunking and embedding as two pipeline steps (phase-11: one
 * job per step, retried on its own). The chunk step must be able to write a
 * row the embed step has not filled yet, so:
 *
 * - `embedding` and `token_count` become nullable — NULL means "chunked, not
 *   embedded yet". The HNSW index skips NULL vectors, and search reads only
 *   embedded rows. `token_count` is the real count from Gemini's countTokens,
 *   written with the embedding — not an estimate (clarifications 2026-09-26).
 * - `content_hash` identifies a chunk's exact text + seq range, so a re-run
 *   after a transcript edit keeps unchanged chunks — their ids, embeddings, and
 *   the graph mentions/relations that cite them — and only re-does changed ones.
 */
export class SplitChunkingFromEmbedding1758000000015 implements MigrationInterface {
  name = 'SplitChunkingFromEmbedding1758000000015';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE meeting_chunks ALTER COLUMN embedding DROP NOT NULL');
    await queryRunner.query('ALTER TABLE meeting_chunks ALTER COLUMN token_count DROP NOT NULL');
    await queryRunner.query(`ALTER TABLE meeting_chunks ADD COLUMN content_hash text`);
    // Existing rows (dev seed) get the same hash the chunker would compute.
    await queryRunner.query(
      `UPDATE meeting_chunks SET content_hash = encode(sha256(convert_to(segment_start_seq || ':' || segment_end_seq || ':' || content, 'UTF8')), 'hex')`,
    );
    await queryRunner.query('ALTER TABLE meeting_chunks ALTER COLUMN content_hash SET NOT NULL');
    await queryRunner.query('CREATE UNIQUE INDEX uq_chunks_meeting_hash ON meeting_chunks (meeting_id, content_hash)');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX uq_chunks_meeting_hash');
    await queryRunner.query('ALTER TABLE meeting_chunks DROP COLUMN content_hash');
    // Rows never embedded cannot satisfy the old NOT NULL constraints.
    await queryRunner.query('DELETE FROM meeting_chunks WHERE embedding IS NULL OR token_count IS NULL');
    await queryRunner.query('ALTER TABLE meeting_chunks ALTER COLUMN token_count SET NOT NULL');
    await queryRunner.query('ALTER TABLE meeting_chunks ALTER COLUMN embedding SET NOT NULL');
  }
}
