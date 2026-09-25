import { MigrationInterface, QueryRunner, Table, TableColumn, TableForeignKey } from 'typeorm';

/**
 * Phase 10–11 state the schema did not have:
 *
 * meetings
 * - `pipeline_run` — increments every time the meeting is (re)queued. Queue job
 *   ids are `<meeting>-r<run>`, so a retry is a new job instead of being
 *   swallowed by BullMQ's id dedupe, and a job from an older run can tell it is stale.
 * - `pipeline_scope` — `full` or `changed` for the current run; kept here, not only
 *   in Redis, so a lost job can be re-enqueued with the right scope.
 * - `pipeline_started_at` / `pipeline_changed_since` — when the current run began,
 *   and when the previous one did. Segments edited after `pipeline_changed_since`
 *   are what a `changed` run re-processes; segments edited after
 *   `pipeline_started_at` are edits the current summary does not reflect yet.
 * - `ready_notified_at` — the "meeting ready" push goes out once per meeting (US-30).
 *
 * transcript_segments
 * - `edited_at` — when the user last corrected the text (US-24). `is_edited`
 *   says *whether*; this says *since which run*.
 *
 * push_tokens — one row per device (Expo push token), deleted with the user.
 */
export class AddPipelineRunsEditsAndPushTokens1758000000014 implements MigrationInterface {
  name = 'AddPipelineRunsEditsAndPushTokens1758000000014';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumns('meetings', [
      new TableColumn({ name: 'pipeline_run', type: 'int', default: 0 }),
      new TableColumn({ name: 'pipeline_scope', type: 'text', default: "'full'" }),
      new TableColumn({ name: 'pipeline_started_at', type: 'timestamptz', isNullable: true }),
      new TableColumn({ name: 'pipeline_changed_since', type: 'timestamptz', isNullable: true }),
      new TableColumn({ name: 'ready_notified_at', type: 'timestamptz', isNullable: true }),
    ]);
    await queryRunner.query(
      `ALTER TABLE meetings ADD CONSTRAINT chk_meetings_pipeline_scope CHECK (pipeline_scope IN ('full', 'changed'))`,
    );
    await queryRunner.addColumn('transcript_segments', new TableColumn({ name: 'edited_at', type: 'timestamptz', isNullable: true }));

    await queryRunner.createTable(
      new Table({
        name: 'push_tokens',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, default: 'gen_random_uuid()' },
          { name: 'user_id', type: 'uuid' },
          { name: 'token', type: 'text', isUnique: true },
          { name: 'platform', type: 'text' },
          { name: 'created_at', type: 'timestamptz', default: 'now()' },
          { name: 'last_seen_at', type: 'timestamptz', default: 'now()' },
        ],
        checks: [{ name: 'chk_push_tokens_platform', expression: `platform IN ('ios', 'android')` }],
        indices: [{ name: 'idx_push_tokens_user', columnNames: ['user_id'] }],
      }),
      true,
    );
    await queryRunner.createForeignKey(
      'push_tokens',
      new TableForeignKey({
        name: 'fk_push_tokens_user',
        columnNames: ['user_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('push_tokens');
    await queryRunner.dropColumn('transcript_segments', 'edited_at');
    await queryRunner.query('ALTER TABLE meetings DROP CONSTRAINT chk_meetings_pipeline_scope');
    await queryRunner.dropColumns('meetings', [
      'ready_notified_at',
      'pipeline_changed_since',
      'pipeline_started_at',
      'pipeline_scope',
      'pipeline_run',
    ]);
  }
}
