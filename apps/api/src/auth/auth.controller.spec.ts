import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const controllerPath = join(here, 'auth.controller.ts');
const apiRoot = join(here, '..', '..');

interface ThrottleMetadata {
  classLimit: number | null;
  classTtl: number | null;
  handlerLimit: number | null;
  handlerTtl: number | null;
}

/**
 * `@Post('google')` must inherit the controller-level throttle
 * (`@UseGuards(ThrottlerGuard)` + `@Throttle({ default: { limit: 10, ttl: 60_000 } })`)
 * rather than trust that Nest's class-level decorators simply "apply everywhere" —
 * asserted by reading the actual reflect-metadata Nest's `Throttle()` decorator
 * writes, on both the class and the handler (phase-03 AC #7).
 *
 * This reads that metadata from a **separate, real Node process** (via `tsx`)
 * instead of importing `auth.controller.ts` directly into this Jest worker.
 * Measured directly: importing `auth.controller.ts` in-process here trips a
 * reproducible `jest-runtime` defect — "Cannot require() ES Module
 * .../@nestjs/common/index.js in a cycle" — the moment the module graph
 * combines `@nestjs/throttler` with a second `@nestjs/*`-scoped package
 * (`@nestjs/jwt`, `@nestjs/typeorm`, `@nestjs/config`, or `@nestjs/swagger`)
 * reached through a locally-imported file (as opposed to a package imported
 * directly by the test file). `AuthController` unavoidably reaches all four
 * through `AuthService`/`GoogleAuthService`, and mocking every one of those
 * packages away (confirmed experimentally) still trips the same error — it is
 * a jest-runtime ESM-linking defect independent of this file's content, not
 * something fixable from inside `apps/api/src/auth/`. Spawning `tsx` sidesteps
 * Jest's VM-modules loader entirely and reads the metadata Node itself
 * actually attached to the real, unmodified class.
 */
function readThrottleMetadata(): ThrottleMetadata {
  const script = `
    import 'reflect-metadata';
    import { AuthController } from ${JSON.stringify(controllerPath)};
    process.stdout.write(JSON.stringify({
      classLimit: Reflect.getMetadata('THROTTLER:LIMITdefault', AuthController) ?? null,
      classTtl: Reflect.getMetadata('THROTTLER:TTLdefault', AuthController) ?? null,
      handlerLimit: Reflect.getMetadata('THROTTLER:LIMITdefault', AuthController.prototype.googleSignIn) ?? null,
      handlerTtl: Reflect.getMetadata('THROTTLER:TTLdefault', AuthController.prototype.googleSignIn) ?? null,
    }));
  `;

  const output = execFileSync(process.execPath, ['--import', 'tsx', '--input-type=module'], {
    input: script,
    encoding: 'utf8',
    cwd: apiRoot,
  });

  return JSON.parse(output) as ThrottleMetadata;
}

describe('AuthController — throttle inheritance', () => {
  let metadata: ThrottleMetadata;

  beforeAll(() => {
    metadata = readThrottleMetadata();
  });

  it('carries limit 10 / ttl 60000 at the class level', () => {
    expect(metadata.classLimit).toBe(10);
    expect(metadata.classTtl).toBe(60_000);
  });

  it('does not carry an overriding @Throttle on the googleSignIn handler', () => {
    expect(metadata.handlerLimit).toBeNull();
    expect(metadata.handlerTtl).toBeNull();
  });
});
