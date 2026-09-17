import 'reflect-metadata';
import { AppDataSource, registerPgVectorTypes } from './data-source.js';

/**
 * Thin migration runner used by `yarn migration:run` / `yarn migration:revert`.
 *
 * We drive `DataSource` directly with `tsx` instead of the `typeorm` CLI's
 * `-ts-node-esm` wrapper: that wrapper shells out to `ts-node/esm`, a
 * dependency this project does not carry (it uses `tsx` everywhere else —
 * see `openapi:generate` in package.json). This keeps migrations on the same
 * toolchain as the rest of the app with zero new dependencies.
 */
async function main(): Promise<void> {
  const direction = process.argv[2];
  if (direction !== 'up' && direction !== 'down') {
    throw new Error("Usage: tsx src/database/migrate.ts <up|down>");
  }

  await AppDataSource.initialize();
  await registerPgVectorTypes(AppDataSource);

  try {
    if (direction === 'up') {
      const applied = await AppDataSource.runMigrations();
      // eslint-disable-next-line no-console
      console.log(`Applied ${applied.length} migration(s).`);
    } else {
      await AppDataSource.undoLastMigration();
      // eslint-disable-next-line no-console
      console.log('Reverted the last migration.');
    }
  } finally {
    await AppDataSource.destroy();
  }
}

main().catch((error: unknown) => {
  // eslint-disable-next-line no-console
  console.error('Migration command failed', error);
  process.exit(1);
});
