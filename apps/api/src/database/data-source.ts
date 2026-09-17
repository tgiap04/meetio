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
} from './entities/index.js';

const thisFile = fileURLToPath(import.meta.url);
const __dirname = dirname(thisFile);
// `tsx` runs this file straight from `.ts` source (migration:run/:revert,
// jest); `nest build` compiles it to `.js` under dist/. Migrations live next
// to whichever extension this file itself has.
const migrationExtension = thisFile.endsWith('.ts') ? 'ts' : 'js';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required to build the TypeORM DataSource');
}

/**
 * The single TypeORM DataSource for the API, used both by the Nest module
 * and the `typeorm` CLI (migration:run / migration:revert / seed).
 *
 * `synchronize: false` is permanent — see phase-02-database-schema.md and
 * docs/data-model.md. TypeORM's schema sync does not know the HNSW indexes
 * or the expression-based trigram index exist, and would drop them.
 */
export const AppDataSource = new DataSource({
  type: 'postgres',
  url: databaseUrl,
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
  ],
  migrations: [join(__dirname, 'migrations', `*.${migrationExtension}`)],
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
