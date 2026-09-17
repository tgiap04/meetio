import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

/**
 * `meetings`, `transcript_segments`, `meeting_chunks` — docs/data-model.md §2, §3.
 *
 * The GIN trigram index on `unaccent(lower(title))` and the HNSW index on
 * `meeting_chunks.embedding` are NOT created here — TypeORM's index DSL
 * cannot express an expression index or an `hnsw` index type. Both are
 * created with raw SQL in 1758000000006-CreateVectorAndTrigramIndexes.ts.
 */
export class CreateMeetingTables1758000000003 implements MigrationInterface {
  name = 'CreateMeetingTables1758000000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'meetings',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, default: 'gen_random_uuid()' },
          { name: 'user_id', type: 'uuid' },
          { name: 'title', type: 'text' },
          {
            name: 'status',
            type: 'enum',
            enum: ['recording', 'paused', 'ended', 'queued', 'processing', 'ready', 'failed'],
            enumName: 'meeting_status',
            default: "'recording'",
          },
          { name: 'source_language', type: 'text' },
          { name: 'translate_to', type: 'text', isNullable: true },
          { name: 'summary', type: 'text', isNullable: true },
          { name: 'summary_citations', type: 'jsonb', isNullable: true },
          { name: 'started_at', type: 'timestamptz', isNullable: true },
          { name: 'ended_at', type: 'timestamptz', isNullable: true },
          { name: 'duration_sec', type: 'int', isNullable: true },
          { name: 'failure_reason', type: 'text', isNullable: true },
          { name: 'last_activity_at', type: 'timestamptz', isNullable: true },
          { name: 'created_at', type: 'timestamptz', default: 'now()' },
          { name: 'updated_at', type: 'timestamptz', default: 'now()' },
          { name: 'deleted_at', type: 'timestamptz', isNullable: true },
        ],
      }),
      true,
    );
    await queryRunner.createForeignKey(
      'meetings',
      new TableForeignKey({
        columnNames: ['user_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
        name: 'fk_meetings_user',
      }),
    );
    await queryRunner.createIndex(
      'meetings',
      new TableIndex({
        name: 'idx_meetings_user_created',
        columnNames: ['user_id', 'created_at'],
        where: 'deleted_at IS NULL',
      }),
    );
    await queryRunner.createIndex(
      'meetings',
      new TableIndex({
        name: 'idx_meetings_status',
        columnNames: ['status'],
        where: "status IN ('recording','queued','processing')",
      }),
    );

    await queryRunner.createTable(
      new Table({
        name: 'transcript_segments',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, default: 'gen_random_uuid()' },
          { name: 'meeting_id', type: 'uuid' },
          { name: 'seq', type: 'int' },
          { name: 'text', type: 'text' },
          { name: 'translated_text', type: 'text', isNullable: true },
          { name: 'translated_to', type: 'text', isNullable: true },
          { name: 'speaker_label', type: 'text', isNullable: true },
          { name: 'started_at_ms', type: 'int' },
          { name: 'ended_at_ms', type: 'int' },
          { name: 'is_edited', type: 'boolean', default: false },
          { name: 'gap_before_ms', type: 'int', isNullable: true },
          { name: 'created_at', type: 'timestamptz', default: 'now()' },
        ],
      }),
      true,
    );
    await queryRunner.createForeignKey(
      'transcript_segments',
      new TableForeignKey({
        columnNames: ['meeting_id'],
        referencedTableName: 'meetings',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
        name: 'fk_segments_meeting',
      }),
    );
    await queryRunner.createIndex(
      'transcript_segments',
      new TableIndex({
        name: 'uq_segment_meeting_seq',
        columnNames: ['meeting_id', 'seq'],
        isUnique: true,
      }),
    );
    await queryRunner.createIndex(
      'transcript_segments',
      new TableIndex({ name: 'idx_segment_meeting_time', columnNames: ['meeting_id', 'started_at_ms'] }),
    );

    await queryRunner.createTable(
      new Table({
        name: 'meeting_chunks',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, default: 'gen_random_uuid()' },
          { name: 'meeting_id', type: 'uuid' },
          { name: 'user_id', type: 'uuid' },
          { name: 'content', type: 'text' },
          { name: 'segment_start_seq', type: 'int' },
          { name: 'segment_end_seq', type: 'int' },
          { name: 'token_count', type: 'int' },
          { name: 'embedding', type: 'vector', length: '768' },
          { name: 'created_at', type: 'timestamptz', default: 'now()' },
        ],
      }),
      true,
    );
    await queryRunner.createForeignKey(
      'meeting_chunks',
      new TableForeignKey({
        columnNames: ['meeting_id'],
        referencedTableName: 'meetings',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
        name: 'fk_chunks_meeting',
      }),
    );
    await queryRunner.createForeignKey(
      'meeting_chunks',
      new TableForeignKey({
        columnNames: ['user_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
        name: 'fk_chunks_user',
      }),
    );
    await queryRunner.createIndex(
      'meeting_chunks',
      new TableIndex({ name: 'idx_chunks_meeting', columnNames: ['meeting_id'] }),
    );
    await queryRunner.createIndex(
      'meeting_chunks',
      new TableIndex({ name: 'idx_chunks_user', columnNames: ['user_id'] }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('meeting_chunks', true, true, true);
    await queryRunner.dropTable('transcript_segments', true, true, true);
    await queryRunner.dropTable('meetings', true, true, true);
  }
}
