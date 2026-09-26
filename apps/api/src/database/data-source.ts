import 'reflect-metadata';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { DataSource } from 'typeorm';
import pgvector from 'pgvector/pg';
import {
  User,
  RefreshToken,
  Meeting,
  TranscriptSegment,
  MeetingChunk,
  EntityRecord,
  EntityMention,
  Relation,
  EntityMergeRejection,
  ActionItem,
  QaMessage,
  ProcessingJob,
  UsageRecord,
  PushToken,
} from './entities/index.js';

const thisFile = fileURLToPath(import.meta.url);
const __dirname = dirname(thisFile);
// `tsx` runs this file straight from `.ts` source (migration:run/:revert,
// jest); `nest build` compiles it to `.js` under dist/. Migrations live next
// to whichever extension this file itself has.
const migrationExtension = thisFile.endsWith('.ts') ? 'ts' : 'js';

/**
 * Throws a readable error when `DATABASE_URL` is missing.
 *
 * Deliberately NOT called while this module is being imported. Constructing a
 * `DataSource` does not open a connection, so nothing here needs the URL until
 * something actually initializes it — and a module-level throw made merely
 * *importing* this file fatal. That broke two things:
 *
 * - `schema.integration.spec.ts` guards itself with `describe.skip` when there
 *   is no database, but the guard never ran: the import blew up first, so the
 *   suite failed instead of skipping.
 * - `nest start` died before Nest could report the problem itself.
 *
 * The entry points that really need a connection (`migrate.ts`, `seed.ts`) call
 * this first, so they keep the clear message. The running app does not rely on
 * it: `database.module.ts` validates `DATABASE_URL` in its own factory.
 */
export function assertDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const url = env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is required to build the TypeORM DataSource');
  }
  return url;
}

/**
 * The single TypeORM DataSource for the API, used by the migration runner and
 * the seed script.
 *
 * `synchronize: false` is permanent — see phase-02-database-schema.md and
 * docs/data-model.md. TypeORM's schema sync does not know the HNSW indexes
 * or the expression-based trigram index exist, and would drop them.
 */
/**
 * Jest suites that only read and write data never need the migration classes, and loading the
 * glob makes TypeORM `import()` every migration file at once from CommonJS — which Jest's ESM
 * runtime intermittently resolves to nothing ("Cannot read properties of undefined (reading
 * 'identifier')" in jest-runtime's dynamicImportFromCjs). Outside Jest, and in the schema suite
 * that reverts migrations (`TEST_LOAD_MIGRATIONS=1`), they load as usual.
 */
const loadMigrations = !process.env.JEST_WORKER_ID || process.env.TEST_LOAD_MIGRATIONS === '1';

export const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  synchronize: false,
  migrationsRun: false,
  logging: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  entities: [
    User,
    RefreshToken,
    Meeting,
    TranscriptSegment,
    MeetingChunk,
    EntityRecord,
    EntityMention,
    Relation,
    EntityMergeRejection,
    ActionItem,
    QaMessage,
    ProcessingJob,
    UsageRecord,
    PushToken,
  ],
  migrations: loadMigrations ? [join(__dirname, 'migrations', `*.${migrationExtension}`)] : [],
});

/**
 * Registers pgvector's text-format type parser on every pooled connection so
 * `vector` columns come back as `number[]` instead of the raw `"[0.1,0.2]"`
 * string. Must run once, right after `AppDataSource.initialize()`.
 */
export async function registerPgVectorTypes(dataSource: DataSource): Promise<void> {
  const pool = (dataSource.driver as unknown as { master: import('pg').Pool }).master;

  // Register on every physical connection the pool opens from now on...
  pool.on('connect', (client) => {
    pgvector.registerTypes(client).catch((error: unknown) => {
      // eslint-disable-next-line no-console
      console.error('Failed to register pgvector type parser on new connection', error);
    });
  });

  // ...and on the one connection the pool may already have opened during
  // `dataSource.initialize()` (its own migrations-check query).
  const existing = await pool.connect();
  try {
    await pgvector.registerTypes(existing);
  } finally {
    existing.release();
  }
}
