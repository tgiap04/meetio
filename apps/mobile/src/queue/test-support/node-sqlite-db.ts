import { DatabaseSync } from 'node:sqlite';
import { QUEUE_SCHEMA, type SqlDb, type SqlParam } from '../queue-db';

/**
 * Test-only: the queue's `SqlDb` over Node's built-in SQLite, so queue tests run real SQL instead of
 * a mock. A transaction holds a lock that every outside statement waits on — the same isolation
 * expo-sqlite's `withExclusiveTransactionAsync` gives on device. Pass a file path to reopen the
 * same database after a simulated app kill.
 */
export function openNodeSqliteDb(path = ':memory:'): SqlDb & { close(): void } {
  const raw = new DatabaseSync(path);
  raw.exec(QUEUE_SCHEMA);
  let lock: Promise<void> = Promise.resolve();
  // One prepared statement per SQL text: far fewer native objects left for the GC to finalise
  // (node:sqlite is experimental; a full suite once lost a worker to SIGSEGV).
  const statements = new Map<string, ReturnType<DatabaseSync['prepare']>>();
  const prepare = (sql: string) => {
    let statement = statements.get(sql);
    if (!statement) statements.set(sql, (statement = raw.prepare(sql)));
    return statement;
  };

  const direct: SqlDb = {
    execAsync: async (sql) => void raw.exec(sql),
    runAsync: async (sql, params: SqlParam[] = []) => ({ changes: Number(prepare(sql).run(...params).changes) }),
    getAllAsync: async <T>(sql: string, params: SqlParam[] = []) => prepare(sql).all(...params) as T[],
    getFirstAsync: async <T>(sql: string, params: SqlParam[] = []) => (prepare(sql).get(...params) as T | undefined) ?? null,
    withExclusiveTransactionAsync: () => Promise.reject(new Error('nested transaction')),
  };

  const waitThen =
    <A extends unknown[], R>(fn: (...args: A) => Promise<R>) =>
    async (...args: A): Promise<R> => {
      await lock;
      return fn(...args);
    };

  return {
    execAsync: waitThen(direct.execAsync),
    runAsync: waitThen(direct.runAsync),
    getAllAsync: waitThen(direct.getAllAsync) as SqlDb['getAllAsync'],
    getFirstAsync: waitThen(direct.getFirstAsync) as SqlDb['getFirstAsync'],
    async withExclusiveTransactionAsync(task) {
      const previous = lock;
      let release!: () => void;
      lock = new Promise<void>((resolve) => (release = resolve));
      await previous;
      raw.exec('BEGIN IMMEDIATE');
      try {
        await task(direct);
        raw.exec('COMMIT');
      } catch (error) {
        raw.exec('ROLLBACK');
        throw error;
      } finally {
        release();
      }
    },
    close: () => {
      statements.clear();
      raw.close();
    },
  };
}
