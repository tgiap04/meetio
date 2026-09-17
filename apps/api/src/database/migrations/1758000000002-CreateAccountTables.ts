import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

/** `users` and `refresh_tokens` — docs/data-model.md §1. */
export class CreateAccountTables1758000000002 implements MigrationInterface {
  name = 'CreateAccountTables1758000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'users',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, default: 'gen_random_uuid()' },
          { name: 'email', type: 'citext', isUnique: true },
          { name: 'password_hash', type: 'text' },
          { name: 'display_name', type: 'text' },
          { name: 'retention_days', type: 'int', isNullable: true },
          { name: 'recording_consent_at', type: 'timestamptz', isNullable: true },
          { name: 'monthly_token_budget', type: 'bigint', isNullable: true },
          { name: 'notification_settings', type: 'jsonb', default: "'{}'" },
          { name: 'created_at', type: 'timestamptz', default: 'now()' },
          { name: 'updated_at', type: 'timestamptz', default: 'now()' },
          { name: 'deleted_at', type: 'timestamptz', isNullable: true },
        ],
      }),
      true,
    );

    await queryRunner.createTable(
      new Table({
        name: 'refresh_tokens',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, default: 'gen_random_uuid()' },
          { name: 'user_id', type: 'uuid' },
          { name: 'token_hash', type: 'text' },
          { name: 'expires_at', type: 'timestamptz' },
          { name: 'revoked_at', type: 'timestamptz', isNullable: true },
          { name: 'device_label', type: 'text', isNullable: true },
          { name: 'created_at', type: 'timestamptz', default: 'now()' },
        ],
      }),
      true,
    );

    await queryRunner.createForeignKey(
      'refresh_tokens',
      new TableForeignKey({
        columnNames: ['user_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
        name: 'fk_refresh_tokens_user',
      }),
    );

    await queryRunner.createIndex(
      'refresh_tokens',
      new TableIndex({ name: 'idx_refresh_tokens_user', columnNames: ['user_id'] }),
    );
    await queryRunner.createIndex(
      'refresh_tokens',
      new TableIndex({ name: 'idx_refresh_tokens_hash', columnNames: ['token_hash'] }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('refresh_tokens', true, true, true);
    await queryRunner.dropTable('users', true, true, true);
  }
}
