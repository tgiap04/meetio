import { MigrationInterface, QueryRunner, TableColumn, TableIndex } from 'typeorm';

/**
 * Opens `users` to Google-only accounts (phase-02-nullable-password-and-google-sub.md).
 *
 * `password_hash` becomes nullable and `google_sub` is added as the Google
 * account key (decisions.md §1 — `sub`, not email). There is deliberately no
 * `provider` column (decisions.md §2): whether an account can log in with a
 * password or with Google is answered by which of these two columns is
 * non-null, and a third column tracking that redundantly is one more place
 * for the truth to drift.
 *
 * The `chk_users_has_credential` CHECK is the actual invariant this migration
 * protects: every row must keep at least one way in, or it becomes data
 * nobody can log into and nobody can delete through the product (US-05).
 *
 * `google_sub` gets a single (non-partial) UNIQUE index. Postgres treats every
 * NULL as distinct under UNIQUE, so any number of not-yet-linked rows are
 * already allowed without a partial index (KISS).
 */
export class AddGoogleIdentityToUsers1758000000010 implements MigrationInterface {
  name = 'AddGoogleIdentityToUsers1758000000010';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.changeColumn(
      'users',
      'password_hash',
      new TableColumn({ name: 'password_hash', type: 'text', isNullable: true }),
    );
    await queryRunner.addColumn(
      'users',
      new TableColumn({ name: 'google_sub', type: 'text', isNullable: true }),
    );
    await queryRunner.createIndex(
      'users',
      new TableIndex({ name: 'idx_users_google_sub', columnNames: ['google_sub'], isUnique: true }),
    );
    await queryRunner.query(
      `ALTER TABLE users ADD CONSTRAINT chk_users_has_credential
         CHECK (password_hash IS NOT NULL OR google_sub IS NOT NULL)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE users DROP CONSTRAINT chk_users_has_credential');
    await queryRunner.dropIndex('users', 'idx_users_google_sub');
    await queryRunner.dropColumn('users', 'google_sub');

    // Restoring NOT NULL on password_hash would silently strand any
    // Google-only row created since `up()` ran — it would either reject the
    // ALTER outright or (with a default) fabricate a fake credential. Refuse
    // loudly instead: reverting this migration in production requires a
    // human decision about those accounts, not a migration's guess.
    const [{ count }] = (await queryRunner.query(
      'SELECT COUNT(*)::int AS count FROM users WHERE password_hash IS NULL',
    )) as [{ count: number }];
    if (count > 0) {
      throw new Error(
        `Cannot revert AddGoogleIdentityToUsers1758000000010: ${count} user(s) have no password_hash ` +
          '(Google-only accounts). Resolve those rows (delete or assign a password) before reverting.',
      );
    }

    await queryRunner.changeColumn(
      'users',
      'password_hash',
      new TableColumn({ name: 'password_hash', type: 'text', isNullable: false }),
    );
  }
}
