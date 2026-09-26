import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { statSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { Queue, QueueEvents } from 'bullmq';
import { Redis } from 'ioredis';
import jwt from 'jsonwebtoken';
import { FakeGeminiServer } from './fake-gemini-server.js';

/**
 * End-to-end harness: runs the **compiled** API (`node dist/main.js`) against
 * the Postgres + Redis from `make up`, and talks to it only the way a client
 * does — HTTP and socket.io. Nothing from `@nestjs/*` is imported here.
 *
 * Why a child process: importing AppModule into a Jest worker trips the
 * jest-runtime ESM defect documented in auth/auth.controller.spec.ts
 * ("Cannot require() ES Module @nestjs/common in a cycle"), and `tsx` cannot
 * stand in because esbuild emits no decorator metadata for Nest DI. The
 * compiled server is also simply the most honest thing to test.
 *
 * Suites skip when DATABASE_URL / REDIS_URL are unset, and FAIL (not skip)
 * when they are set but unreachable — the rule schema.integration.spec.ts uses.
 */
export const hasInfra = Boolean(process.env.DATABASE_URL && process.env.REDIS_URL && process.env.JWT_ACCESS_SECRET);

const apiRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export interface E2eApp {
  baseUrl: string;
  /** Local stand-in for Gemini the server is pointed at (keys `e2e-key-a`, `e2e-key-b`). */
  gemini: FakeGeminiServer;
  db: pg.Pool;
  processingQueue: Queue;
  createUser(): Promise<{ id: string; token: string }>;
  tokenFor(userId: string, expiresInSec?: number): string;
  // Response bodies are asserted field by field with toMatchObject; typing every
  // endpoint's JSON here would duplicate the DTOs for no extra safety.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  http(method: string, path: string, token: string, body?: unknown): Promise<{ status: number; body: any }>;
  /** Runs one meeting-maintenance sweep inside the server's own BullMQ worker and returns its result. */
  runMaintenance(jobName: 'close-abandoned-meetings' | 'requeue-stranded-meetings' | 'resume-stalled-pipelines'): Promise<number>;
  /** Everything the server process printed — attach to failure messages when debugging. */
  logs(): string;
  close(): Promise<void>;
}

function newestMtime(dir: string): number {
  let newest = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    newest = Math.max(newest, entry.isDirectory() ? newestMtime(full) : statSync(full).mtimeMs);
  }
  return newest;
}

/** Rebuilds dist/ when any source file is newer — an e2e run must never test stale code. */
function ensureFreshBuild(): void {
  let built = 0;
  try {
    built = statSync(join(apiRoot, 'dist', 'main.js')).mtimeMs;
  } catch {
    built = 0;
  }
  const sourceRoots = [join(apiRoot, 'src'), join(apiRoot, '..', '..', 'packages', 'shared', 'src')];
  if (sourceRoots.some((root) => newestMtime(root) > built)) {
    execFileSync('yarn', ['workspace', '@meetio/shared', 'build'], { cwd: apiRoot, stdio: 'ignore' });
    execFileSync('yarn', ['nest', 'build'], { cwd: apiRoot, stdio: 'ignore' });
  }
}

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, () => {
      const { port } = server.address() as { port: number };
      server.close(() => resolve(port));
    });
  });
}

async function waitForHealth(baseUrl: string, child: ChildProcess, output: () => string): Promise<void> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`API exited with ${child.exitCode} before becoming healthy:\n${output()}`);
    }
    try {
      if ((await fetch(`${baseUrl}/api/health`)).ok) return;
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`API did not become healthy within 30s:\n${output()}`);
}

export async function startE2eApp(extraEnv: Record<string, string> = {}): Promise<E2eApp> {
  ensureFreshBuild();
  const port = await freePort();
  const baseUrl = `http://localhost:${port}`;
  let log = '';
  // Own BullMQ namespace: a developer's `make dev` server on the same Redis
  // would otherwise consume this server's jobs (it happened — see the journal).
  const bullPrefix = `e2e-${randomUUID()}`;
  const gemini = new FakeGeminiServer();
  await gemini.start();
  const child = spawn(process.execPath, ['dist/main.js'], {
    cwd: apiRoot,
    env: {
      ...process.env,
      PORT: String(port),
      SWAGGER_ENABLED: 'false',
      BULLMQ_PREFIX: bullPrefix,
      GEMINI_API_KEY: 'e2e-key-a,e2e-key-b',
      GEMINI_BASE_URL: gemini.baseUrl,
      // Fail fast when a test makes a step fail (production: 2s/8s/32s).
      PIPELINE_RETRY_BASE_MS: '20',
      ...extraEnv,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout?.on('data', (d) => (log += d));
  child.stderr?.on('data', (d) => (log += d));
  await waitForHealth(baseUrl, child, () => log);

  const db = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 4 });
  const connection = () => new Redis(process.env.REDIS_URL!, { maxRetriesPerRequest: null });
  const processingQueue = new Queue('meeting-processing', { connection: connection(), prefix: bullPrefix });
  const maintenanceQueue = new Queue('meeting-maintenance', { connection: connection(), prefix: bullPrefix });
  const maintenanceEvents = new QueueEvents('meeting-maintenance', { connection: connection(), prefix: bullPrefix });
  await maintenanceEvents.waitUntilReady();
  const userIds: string[] = [];
  const secret = process.env.JWT_ACCESS_SECRET!;

  const tokenFor = (userId: string, expiresInSec = 900) => jwt.sign({ sub: userId, jti: randomUUID() }, secret, { expiresIn: expiresInSec });

  return {
    baseUrl,
    gemini,
    db,
    processingQueue,
    tokenFor,
    logs: () => log,
    async createUser() {
      const id = randomUUID();
      // chk_users_has_credential needs a password hash or a google_sub; nobody logs in with this one.
      await db.query(`INSERT INTO users (id, email, display_name, password_hash) VALUES ($1, $2, 'E2E', 'e2e-no-login')`, [
        id,
        `e2e-${id}@meetio.test`,
      ]);
      userIds.push(id);
      return { id, token: tokenFor(id) };
    },
    async http(method, path, token, body) {
      const response = await fetch(`${baseUrl}/api${path}`, {
        method,
        headers: { authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const text = await response.text();
      return { status: response.status, body: text ? JSON.parse(text) : null };
    },
    async runMaintenance(jobName) {
      const job = await maintenanceQueue.add(jobName, {}, { removeOnComplete: true, removeOnFail: true });
      return (await job.waitUntilFinished(maintenanceEvents, 30_000)) as number;
    },
    async close() {
      // Stop the server first: its pipeline may still be writing to these meetings, and deleting under
      // a running resolve/summarize step deadlocks. Then meetings and everything under them go with
      // the users via ON DELETE CASCADE.
      child.kill('SIGTERM');
      await new Promise((r) => (child.exitCode !== null ? r(null) : child.once('exit', r)));
      await db.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [userIds]);
      await Promise.all([processingQueue.close(), maintenanceQueue.close(), maintenanceEvents.close(), db.end()]);
      // Drop this run's whole BullMQ namespace (queues, schedulers, events).
      const redis = connection();
      let cursor = '0';
      do {
        const [next, keys] = await redis.scan(cursor, 'MATCH', `${bullPrefix}:*`, 'COUNT', 500);
        cursor = next;
        if (keys.length > 0) await redis.del(...keys);
      } while (cursor !== '0');
      await redis.quit();
      await gemini.stop();
    },
  };
}
