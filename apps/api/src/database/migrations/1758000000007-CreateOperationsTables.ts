import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

/** `processing_jobs`, `usage_records` — docs/data-model.md §6. */
export class CreateOperationsTables1758000000007 implements MigrationInterface {
  name = 'CreateOperationsTables1758000000007';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'processing_jobs',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, default: 'gen_random_uuid()' },
          { name: 'meeting_id', type: 'uuid' },
          {
            name: 'step',
            type: 'enum',
            enum: ['chunk', 'embed', 'extract', 'resolve', 'summarize'],
            enumName: 'job_step',
          },
          {
            name: 'status',
            type: 'enum',
            enum: ['pending', 'running', 'succeeded', 'failed'],
            enumName: 'job_status',
            default: "'pending'",
          },
          { name: 'attempts', type: 'int', default: 0 },
          { name: 'error_message', type: 'text', isNullable: true },
          { name: 'started_at', type: 'timestamptz', isNullable: true },
          { name: 'finished_at', type: 'timestamptz', isNullable: true },
        ],
      }),
      true,
    );
    await queryRunner.createForeignKey(
      'processing_jobs',
      new TableForeignKey({
        columnNames: ['meeting_id'],
        referencedTableName: 'meetings',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
        name: 'fk_processing_jobs_meeting',
      }),
    );
    await queryRunner.createIndex(
      'processing_jobs',
      new TableIndex({ name: 'uq_job_meeting_step', columnNames: ['meeting_id', 'step'], isUnique: true }),
    );

    await queryRunner.createTable(
      new Table({
        name: 'usage_records',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, default: 'gen_random_uuid()' },
          { name: 'user_id', type: 'uuid' },
          { name: 'meeting_id', type: 'uuid', isNullable: true },
          { name: 'operation', type: 'text' },
          { name: 'model', type: 'text' },
          { name: 'input_tokens', type: 'int' },
          { name: 'output_tokens', type: 'int' },
          { name: 'created_at', type: 'timestamptz', default: 'now()' },
        ],
      }),
      true,
    );
    await queryRunner.createForeignKey(
      'usage_records',
      new TableForeignKey({
        columnNames: ['user_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
        name: 'fk_usage_records_user',
      }),
    );
    // Deliberately SET NULL, not CASCADE: §7 of docs/data-model.md does not
    // list usage_records among the meeting-delete cascade set — a billing
    // audit trail must outlive the meeting it was incurred for.
    await queryRunner.createForeignKey(
      'usage_records',
      new TableForeignKey({
        columnNames: ['meeting_id'],
        referencedTableName: 'meetings',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
        name: 'fk_usage_records_meeting',
      }),
    );
    await queryRunner.createIndex(
      'usage_records',
      new TableIndex({ name: 'idx_usage_records_user', columnNames: ['user_id'] }),
    );
    await queryRunner.createIndex(
      'usage_records',
      new TableIndex({ name: 'idx_usage_records_meeting', columnNames: ['meeting_id'] }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('usage_records', true, true, true);
    await queryRunner.dropTable('processing_jobs', true, true, true);
  }
}
