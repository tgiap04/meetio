import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 15: question answering.
 *
 * - `qa_messages.not_found`: nothing in the user's meetings answered the question — said plainly,
 *   and the model was never asked to guess (US-35).
 * - `qa_messages.filters`: the date range / entity a global question was asked with, shown as
 *   labels on that question (one global thread — clarifications 2026-09-26).
 */
export class AddQaAnswerState1758000000018 implements MigrationInterface {
  name = 'AddQaAnswerState1758000000018';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE qa_messages ADD COLUMN not_found boolean NOT NULL DEFAULT false');
    await queryRunner.query('ALTER TABLE qa_messages ADD COLUMN filters jsonb');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE qa_messages DROP COLUMN filters');
    await queryRunner.query('ALTER TABLE qa_messages DROP COLUMN not_found');
  }
}
