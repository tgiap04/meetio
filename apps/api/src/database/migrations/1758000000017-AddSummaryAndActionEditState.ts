import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 14: summaries and action items.
 *
 * - `meetings.summary_insufficient`: the meeting was too short or empty to summarize — the summary
 *   says so instead of inventing points (US-31).
 * - `action_items.is_user_edited`: set by any user change (edit, tick). A pipeline re-run replaces
 *   only the AI items nobody touched, so a ticked or corrected item survives (clarifications
 *   2026-09-26).
 * - `action_item_dismissals`: tasks the user deleted, by normalized content per meeting, so a
 *   re-run does not bring back an AI task the user already threw away.
 */
export class AddSummaryAndActionEditState1758000000017 implements MigrationInterface {
  name = 'AddSummaryAndActionEditState1758000000017';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE meetings ADD COLUMN summary_insufficient boolean NOT NULL DEFAULT false');
    await queryRunner.query('ALTER TABLE action_items ADD COLUMN is_user_edited boolean NOT NULL DEFAULT false');
    await queryRunner.query(`
      CREATE TABLE action_item_dismissals (
        meeting_id uuid NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
        content_key text NOT NULL,
        dismissed_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (meeting_id, content_key)
      )`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE action_item_dismissals');
    await queryRunner.query('ALTER TABLE action_items DROP COLUMN is_user_edited');
    await queryRunner.query('ALTER TABLE meetings DROP COLUMN summary_insufficient');
  }
}
