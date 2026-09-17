import { AppDataSource, assertDatabaseUrl } from './data-source.js';

describe('AppDataSource', () => {
  it('never enables schema synchronize — HNSW/expression indexes are invisible to it', () => {
    expect(AppDataSource.options.synchronize).toBe(false);
  });

  it('never auto-runs migrations on boot', () => {
    expect(AppDataSource.options.migrationsRun).toBe(false);
  });

  it('registers exactly the 13 schema entities', () => {
    const entities = AppDataSource.options.entities as unknown[];
    expect(entities).toHaveLength(13);
  });

  it('is a postgres data source', () => {
    expect(AppDataSource.options.type).toBe('postgres');
  });
});

describe('assertDatabaseUrl', () => {
  it('returns the url when it is present', () => {
    expect(assertDatabaseUrl({ DATABASE_URL: 'postgresql://u:p@h:5432/db' })).toBe(
      'postgresql://u:p@h:5432/db',
    );
  });

  it.each([{}, { DATABASE_URL: '' }])('throws a readable error for %p', (env) => {
    expect(() => assertDatabaseUrl(env)).toThrow('DATABASE_URL is required');
  });

  it('is not invoked while the module is merely imported', () => {
    // Importing this module used to throw when DATABASE_URL was unset, which made
    // schema.integration.spec.ts fail instead of skip — its own describe.skip guard
    // never ran, because the import blew up first. Constructing a DataSource opens
    // no connection, so the check belongs at the point of use, not at import time.
    // Reaching this line at all is the assertion: the import above succeeded.
    expect(AppDataSource.options.type).toBe('postgres');
  });
});
