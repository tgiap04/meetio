import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Loads the workspace-root `.env` into `process.env`, as an import side effect.
 *
 * Why this exists rather than a `--env-file` flag on the start script:
 *
 * - `nest start` has no way to pass node options through (there is no `--exec`),
 *   and `nest start -- --env-file=…` forwards the flag to the *application* argv,
 *   where node never sees it.
 * - `NODE_OPTIONS=--env-file=…` is rejected outright: node answers
 *   "--env-file= is not allowed in NODE_OPTIONS".
 * - `ConfigModule.forRoot()` is too late. `database/data-source.ts` reads
 *   `DATABASE_URL` while the module graph is still being *imported*, long before
 *   Nest constructs any provider — which is exactly where `nest start --watch`
 *   used to die with "DATABASE_URL is required to build the TypeORM DataSource".
 *
 * So the load has to happen as the first thing the process does. Import this
 * module before anything that touches `process.env`.
 *
 * `process.loadEnvFile()` never overwrites a variable that is already set, so the
 * precedence stays **real environment > workspace `.env`**. A deployed container
 * that injects its own configuration is unaffected, and ships no `.env` at all —
 * hence the silent no-op when the file is absent.
 */
function loadWorkspaceEnv(): void {
  // Resolve from this module rather than the CWD: the API is started from the
  // repo root, from apps/api, and by jest, and must behave the same in all three.
  // Works unchanged from src/ under tsx and from dist/ after `nest build`.
  let dir = dirname(fileURLToPath(import.meta.url));

  for (let depth = 0; depth < 6; depth += 1) {
    const candidate = resolve(dir, '.env');
    if (existsSync(candidate)) {
      process.loadEnvFile(candidate);
      return;
    }

    const parent = dirname(dir);
    if (parent === dir) {
      return; // reached the filesystem root
    }
    dir = parent;
  }
}

loadWorkspaceEnv();
