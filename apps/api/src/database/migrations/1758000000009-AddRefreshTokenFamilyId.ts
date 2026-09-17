import { MigrationInterface, QueryRunner, TableColumn, TableIndex } from 'typeorm';

/**
 * Adds `family_id` to `refresh_tokens` — the rotation-chain key used for
 * theft detection (phase-03-auth-and-account.md). Every refresh token
 * created by rotating an existing one shares its parent's `family_id`; the
 * first token in a chain (issued at register/login) has `family_id = id`.
 *
 * Reusing an already-rotated (revoked) token is treated as theft: the
 * `AuthService` revokes every row sharing that `family_id`, killing the
 * whole chain instead of just the reused token.
 */
export class AddRefreshTokenFamilyId1758000000009 implements MigrationInterface {
  name = 'AddRefreshTokenFamilyId1758000000009';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'refresh_tokens',
      new TableColumn({ name: 'family_id', type: 'uuid', isNullable: true }),
    );
    // Existing rows (none in a fresh DB, but safe for any pre-existing data):
    // a token with no known parent starts its own chain.
    await queryRunner.query('UPDATE refresh_tokens SET family_id = id WHERE family_id IS NULL');
    await queryRunner.changeColumn(
      'refresh_tokens',
      'family_id',
      new TableColumn({ name: 'family_id', type: 'uuid', isNullable: false }),
    );
    await queryRunner.createIndex(
      'refresh_tokens',
      new TableIndex({ name: 'idx_refresh_tokens_family', columnNames: ['family_id'] }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex('refresh_tokens', 'idx_refresh_tokens_family');
    await queryRunner.dropColumn('refresh_tokens', 'family_id');
  }
}
