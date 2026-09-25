import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `idx_meetings_status` is partial on the statuses that are few and scanned
 * often. Phase-04's abandoned-meeting sweep also scans `paused` every 15
 * minutes (a paused meeting left for 24h must still be closed, US-15), and
 * `paused` was not covered — so the sweep would fall back to a full scan of
 * `meetings`. `paused` is as rare as `recording`, so it belongs in the index.
 */
export class IndexPausedMeetingsForSweep1758000000013 implements MigrationInterface {
  name = 'IndexPausedMeetingsForSweep1758000000013';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS idx_meetings_status');
    await queryRunner.query(
      `CREATE INDEX idx_meetings_status ON meetings (status) WHERE status IN ('recording','paused','queued','processing')`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS idx_meetings_status');
    await queryRunner.query(`CREATE INDEX idx_meetings_status ON meetings (status) WHERE status IN ('recording','queued','processing')`);
  }
}
