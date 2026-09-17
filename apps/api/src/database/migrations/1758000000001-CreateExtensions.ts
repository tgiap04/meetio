import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The 3 Postgres extensions the schema depends on. Also created by
 * infra/postgres-init/01-extensions.sql on first container boot, but that
 * script only runs once against an empty data volume — this migration makes
 * a fresh test/CI database (no init script) work the same way.
 *
 * `CREATE EXTENSION` has no TypeORM DSL equivalent — raw SQL is required.
 */
export class CreateExtensions1758000000001 implements MigrationInterface {
  name = 'CreateExtensions1758000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS vector');
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS unaccent');
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS pg_trgm');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP EXTENSION IF EXISTS pg_trgm');
    await queryRunner.query('DROP EXTENSION IF EXISTS unaccent');
    await queryRunner.query('DROP EXTENSION IF EXISTS vector');
  }
}
