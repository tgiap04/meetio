/**
 * Loads the repo-root `.env` before any test module is evaluated, so
 * database.* integration tests (which need DATABASE_URL to reach the real
 * Postgres started by `docker compose up -d`) work without extra ceremony —
 * matching how the `migration:run` / `db:seed` scripts load env via
 * `node --env-file=../../.env`.
 *
 * Never overwrites a variable the shell/CI already set.
 */
const fs = require('node:fs');
const path = require('node:path');

const envPath = path.resolve(__dirname, '../../.env');

if (fs.existsSync(envPath)) {
  const contents = fs.readFileSync(envPath, 'utf8');
  for (const rawLine of contents.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIndex = line.indexOf('=');
    if (eqIndex === -1) continue;
    const key = line.slice(0, eqIndex).trim();
    const value = line.slice(eqIndex + 1).trim();
    if (key && !(key in process.env)) {
      process.env[key] = value;
    }
  }
}
