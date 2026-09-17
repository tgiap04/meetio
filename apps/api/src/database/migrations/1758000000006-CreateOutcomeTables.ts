import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

/** `action_items`, `qa_messages` — docs/data-model.md §5. */
export class CreateOutcomeTables1758000000006 implements MigrationInterface {
  name = 'CreateOutcomeTables1758000000006';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'action_items',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, default: 'gen_random_uuid()' },
          { name: 'meeting_id', type: 'uuid' },
          { name: 'user_id', type: 'uuid' },
          { name: 'content', type: 'text' },
          { name: 'assignee_entity_id', type: 'uuid', isNullable: true },
          { name: 'due_date', type: 'date', isNullable: true },
          {
            name: 'status',
            type: 'enum',
            enum: ['open', 'done'],
            enumName: 'action_status',
            default: "'open'",
          },
          { name: 'source_chunk_id', type: 'uuid', isNullable: true },
          { name: 'is_manual', type: 'boolean', default: false },
          { name: 'created_at', type: 'timestamptz', default: 'now()' },
          { name: 'updated_at', type: 'timestamptz', default: 'now()' },
        ],
      }),
      true,
    );
    await queryRunner.createForeignKey(
      'action_items',
      new TableForeignKey({
        columnNames: ['meeting_id'],
        referencedTableName: 'meetings',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
        name: 'fk_action_items_meeting',
      }),
    );
    await queryRunner.createForeignKey(
      'action_items',
      new TableForeignKey({
        columnNames: ['user_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
        name: 'fk_action_items_user',
      }),
    );
    await queryRunner.createForeignKey(
      'action_items',
      new TableForeignKey({
        columnNames: ['assignee_entity_id'],
        referencedTableName: 'entities',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
        name: 'fk_action_items_assignee',
      }),
    );
    await queryRunner.createForeignKey(
      'action_items',
      new TableForeignKey({
        columnNames: ['source_chunk_id'],
        referencedTableName: 'meeting_chunks',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
        name: 'fk_action_items_source_chunk',
      }),
    );
    await queryRunner.createIndex(
      'action_items',
      new TableIndex({ name: 'idx_actions_user_status', columnNames: ['user_id', 'status', 'due_date'] }),
    );
    await queryRunner.createIndex(
      'action_items',
      new TableIndex({ name: 'idx_action_items_meeting', columnNames: ['meeting_id'] }),
    );
    await queryRunner.createIndex(
      'action_items',
      new TableIndex({ name: 'idx_action_items_assignee', columnNames: ['assignee_entity_id'] }),
    );
    await queryRunner.createIndex(
      'action_items',
      new TableIndex({ name: 'idx_action_items_source_chunk', columnNames: ['source_chunk_id'] }),
    );

    await queryRunner.createTable(
      new Table({
        name: 'qa_messages',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, default: 'gen_random_uuid()' },
          { name: 'user_id', type: 'uuid' },
          { name: 'meeting_id', type: 'uuid', isNullable: true },
          // Plain varchar + CHECK, not a PG enum — see enums/qa-role.enum.ts.
          { name: 'role', type: 'varchar', length: '16' },
          { name: 'content', type: 'text' },
          { name: 'citations', type: 'jsonb', isNullable: true },
          { name: 'confidence', type: 'real', isNullable: true },
          { name: 'tokens_used', type: 'int', isNullable: true },
          { name: 'created_at', type: 'timestamptz', default: 'now()' },
        ],
      }),
      true,
    );
    await queryRunner.query(
      "ALTER TABLE qa_messages ADD CONSTRAINT chk_qa_messages_role CHECK (role IN ('user','assistant'))",
    );
    await queryRunner.createForeignKey(
      'qa_messages',
      new TableForeignKey({
        columnNames: ['user_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
        name: 'fk_qa_messages_user',
      }),
    );
    await queryRunner.createForeignKey(
      'qa_messages',
      new TableForeignKey({
        columnNames: ['meeting_id'],
        referencedTableName: 'meetings',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
        name: 'fk_qa_messages_meeting',
      }),
    );
    await queryRunner.createIndex(
      'qa_messages',
      new TableIndex({ name: 'idx_qa_user_meeting', columnNames: ['user_id', 'meeting_id', 'created_at'] }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('qa_messages', true, true, true);
    await queryRunner.dropTable('action_items', true, true, true);
  }
}
