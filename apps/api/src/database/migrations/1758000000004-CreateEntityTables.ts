import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

/**
 * `entities`, `entity_mentions` — docs/data-model.md §4. The graph is scoped
 * to the USER, not the meeting.
 *
 * The HNSW index on `entities.embedding` is created with raw SQL in
 * 1758000000008-CreateVectorAndTrigramIndexes.ts (see that file for why).
 */
export class CreateEntityTables1758000000004 implements MigrationInterface {
  name = 'CreateEntityTables1758000000004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'entities',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, default: 'gen_random_uuid()' },
          { name: 'user_id', type: 'uuid' },
          { name: 'canonical_name', type: 'text' },
          { name: 'normalized_name', type: 'text' },
          {
            name: 'type',
            type: 'enum',
            enum: ['person', 'project', 'organization', 'topic', 'product', 'other'],
            enumName: 'entity_type',
          },
          { name: 'description', type: 'text', isNullable: true },
          { name: 'aliases', type: 'text', isArray: true, default: "'{}'" },
          { name: 'embedding', type: 'vector', length: '768' },
          { name: 'is_user_edited', type: 'boolean', default: false },
          { name: 'merged_into_id', type: 'uuid', isNullable: true },
          { name: 'created_at', type: 'timestamptz', default: 'now()' },
          { name: 'updated_at', type: 'timestamptz', default: 'now()' },
        ],
      }),
      true,
    );
    await queryRunner.createForeignKey(
      'entities',
      new TableForeignKey({
        columnNames: ['user_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
        name: 'fk_entities_user',
      }),
    );
    await queryRunner.createForeignKey(
      'entities',
      new TableForeignKey({
        columnNames: ['merged_into_id'],
        referencedTableName: 'entities',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
        name: 'fk_entities_merged_into',
      }),
    );
    await queryRunner.createIndex(
      'entities',
      new TableIndex({ name: 'idx_entities_user_norm', columnNames: ['user_id', 'normalized_name'] }),
    );
    await queryRunner.createIndex(
      'entities',
      new TableIndex({ name: 'idx_entities_aliases', columnNames: ['aliases'], type: 'gin' }),
    );
    await queryRunner.createIndex(
      'entities',
      new TableIndex({ name: 'idx_entities_merged_into', columnNames: ['merged_into_id'] }),
    );

    await queryRunner.createTable(
      new Table({
        name: 'entity_mentions',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, default: 'gen_random_uuid()' },
          { name: 'entity_id', type: 'uuid' },
          { name: 'meeting_id', type: 'uuid' },
          { name: 'chunk_id', type: 'uuid' },
          { name: 'surface_form', type: 'text' },
          { name: 'created_at', type: 'timestamptz', default: 'now()' },
        ],
      }),
      true,
    );
    await queryRunner.createForeignKey(
      'entity_mentions',
      new TableForeignKey({
        columnNames: ['entity_id'],
        referencedTableName: 'entities',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
        name: 'fk_mentions_entity',
      }),
    );
    await queryRunner.createForeignKey(
      'entity_mentions',
      new TableForeignKey({
        columnNames: ['meeting_id'],
        referencedTableName: 'meetings',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
        name: 'fk_mentions_meeting',
      }),
    );
    await queryRunner.createForeignKey(
      'entity_mentions',
      new TableForeignKey({
        columnNames: ['chunk_id'],
        referencedTableName: 'meeting_chunks',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
        name: 'fk_mentions_chunk',
      }),
    );
    await queryRunner.createIndex(
      'entity_mentions',
      new TableIndex({ name: 'idx_mentions_entity', columnNames: ['entity_id', 'meeting_id'] }),
    );
    await queryRunner.createIndex(
      'entity_mentions',
      new TableIndex({ name: 'idx_mentions_meeting', columnNames: ['meeting_id'] }),
    );
    await queryRunner.createIndex(
      'entity_mentions',
      new TableIndex({ name: 'idx_mentions_chunk', columnNames: ['chunk_id'] }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('entity_mentions', true, true, true);
    await queryRunner.dropTable('entities', true, true, true);
  }
}
