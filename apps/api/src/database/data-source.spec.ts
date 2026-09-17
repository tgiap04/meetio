import { AppDataSource } from './data-source.js';

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
