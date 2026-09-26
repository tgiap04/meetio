import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 16: privacy and observability.
 *
 * - `users.consent_version`: which consent text the user accepted. The text changed (v2 states that
 *   transcripts go to Google Gemini and that audio never leaves the phone — NFR-01), so everyone
 *   who accepted before is recorded as v1 and asked again before recording.
 * - `meetings.retention_notified_at`: the one "about to be deleted" push was sent (retention job).
 * - `qa_messages.latency_ms`: how long an answer took, to watch NFR-05 in production.
 */
export class AddConsentVersionRetentionNoticeQaLatency1758000000019 implements MigrationInterface {
  name = 'AddConsentVersionRetentionNoticeQaLatency1758000000019';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE users ADD COLUMN consent_version int');
    await queryRunner.query('UPDATE users SET consent_version = 1 WHERE recording_consent_at IS NOT NULL');
    await queryRunner.query('ALTER TABLE meetings ADD COLUMN retention_notified_at timestamptz');
    await queryRunner.query('ALTER TABLE qa_messages ADD COLUMN latency_ms int');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE qa_messages DROP COLUMN latency_ms');
    await queryRunner.query('ALTER TABLE meetings DROP COLUMN retention_notified_at');
    await queryRunner.query('ALTER TABLE users DROP COLUMN consent_version');
  }
}
