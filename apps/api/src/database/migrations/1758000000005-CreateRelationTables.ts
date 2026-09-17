import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

/** `relations`, `entity_merge_rejections` — docs/data-model.md §4. */
export class CreateRelationTables1758000000005 implements MigrationInterface {
  name = 'CreateRelationTables1758000000005';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'relations',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, default: 'gen_random_uuid()' },
          { name: 'user_id', type: 'uuid' },
          { name: 'source_entity_id', type: 'uuid' },
          { name: 'target_entity_id', type: 'uuid' },
          { name: 'relationship', type: 'text' },
          { name: 'meeting_id', type: 'uuid' },
          { name: 'chunk_id', type: 'uuid' },
          { name: 'confidence', type: 'real' },
          { name: 'created_at', type: 'timestamptz', default: 'now()' },
        ],
      }),
      true,
    );
    await queryRunner.createForeignKey(
      'relations',
      new TableForeignKey({
        columnNames: ['user_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
        name: 'fk_relations_user',
      }),
    );
    await queryRunner.createForeignKey(
      'relations',
      new TableForeignKey({
        columnNames: ['source_entity_id'],
        referencedTableName: 'entities',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
        name: 'fk_relations_source',
      }),
    );
    await queryRunner.createForeignKey(
      'relations',
      new TableForeignKey({
        columnNames: ['target_entity_id'],
        referencedTableName: 'entities',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
        name: 'fk_relations_target',
      }),
    );
    await queryRunner.createForeignKey(
      'relations',
      new TableForeignKey({
        columnNames: ['meeting_id'],
        referencedTableName: 'meetings',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
        name: 'fk_relations_meeting',
      }),
    );
    await queryRunner.createForeignKey(
      'relations',
      new TableForeignKey({
        columnNames: ['chunk_id'],
        referencedTableName: 'meeting_chunks',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
        name: 'fk_relations_chunk',
      }),
    );
    await queryRunner.createIndex(
      'relations',
      new TableIndex({ name: 'idx_relations_source', columnNames: ['source_entity_id'] }),
    );
    await queryRunner.createIndex(
      'relations',
      new TableIndex({ name: 'idx_relations_target', columnNames: ['target_entity_id'] }),
    );
    await queryRunner.createIndex(
      'relations',
      new TableIndex({ name: 'idx_relations_user', columnNames: ['user_id'] }),
    );
    await queryRunner.createIndex(
      'relations',
      new TableIndex({ name: 'idx_relations_meeting', columnNames: ['meeting_id'] }),
    );
    await queryRunner.createIndex(
      'relations',
      new TableIndex({ name: 'idx_relations_chunk', columnNames: ['chunk_id'] }),
    );

    await queryRunner.createTable(
      new Table({
        name: 'entity_merge_rejections',
        columns: [
          { name: 'user_id', type: 'uuid', isPrimary: true },
          { name: 'entity_a_id', type: 'uuid', isPrimary: true },
          { name: 'entity_b_id', type: 'uuid', isPrimary: true },
          { name: 'rejected_at', type: 'timestamptz', default: 'now()' },
        ],
      }),
      true,
    );
    await queryRunner.createForeignKey(
      'entity_merge_rejections',
      new TableForeignKey({
        columnNames: ['user_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
        name: 'fk_merge_rejections_user',
      }),
    );
    await queryRunner.createForeignKey(
      'entity_merge_rejections',
      new TableForeignKey({
        columnNames: ['entity_a_id'],
        referencedTableName: 'entities',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
        name: 'fk_merge_rejections_entity_a',
      }),
    );
    await queryRunner.createForeignKey(
      'entity_merge_rejections',
      new TableForeignKey({
        columnNames: ['entity_b_id'],
        referencedTableName: 'entities',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
        name: 'fk_merge_rejections_entity_b',
      }),
    );
    await queryRunner.createIndex(
      'entity_merge_rejections',
      new TableIndex({ name: 'idx_merge_rejections_entity_b', columnNames: ['entity_b_id'] }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('entity_merge_rejections', true, true, true);
    await queryRunner.dropTable('relations', true, true, true);
  }
}
