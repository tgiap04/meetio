import { readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { APP_HOME_ROUTE } from './route-guards';

/** Every file under `app/`, recursively, as paths relative to `app/`. */
function walkAppDir(dir: string, root: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walkAppDir(full, root) : [relative(root, full)];
  });
}

/**
 * Proves the route-tree assumption phase-01 depends on, in place of the
 * on-device check the phase file originally called for (Step 3) — this
 * session has no simulator to run the app in. Expo Router's documented group
 * semantics: a parenthesised path segment (`(app)`, `(tabs)`) is a
 * file-system grouping only and never appears in the resolved URL. So
 * `APP_HOME_ROUTE = '/(app)'` — literally just the `(app)` group with no
 * leaf segment — resolves to that group's own `index` route, which after
 * this phase's move lives one level deeper at `(app)/(tabs)/index.tsx`.
 *
 * What this test can prove: the file that route must resolve to actually
 * exists on disk, and the `(tabs)` group holds exactly the four screens the
 * tab bar wires up. What it cannot prove: that Expo Router's runtime resolver
 * actually walks nested groups this way on a real device/simulator — that is
 * unverified and called out in the phase-01 hand-back as an outstanding
 * manual check.
 */
describe('APP_HOME_ROUTE resolves to a route file that exists on disk', () => {
  const appDir = join(__dirname, '../../app');

  it('is the (app) group with no leaf segment, per route-guards.ts', () => {
    expect(APP_HOME_ROUTE).toBe('/(app)');
  });

  it('has a matching (app)/(tabs)/index.tsx file on disk', () => {
    const tabsDir = join(appDir, '(app)', '(tabs)');
    const files = readdirSync(tabsDir);
    expect(files).toContain('index.tsx');
  });

  it('has all four tab route files in the (tabs) group', () => {
    const tabsDir = join(appDir, '(app)', '(tabs)');
    const files = readdirSync(tabsDir).filter((f) => f.endsWith('.tsx'));
    expect(files.sort()).toEqual(['_layout.tsx', 'index.tsx', 'library.tsx', 'search.tsx', 'settings.tsx']);
  });
});

/**
 * Expo Router turns EVERY file under `app/` into a route — including test
 * files. A `*.test.tsx` left there ships as a route and drags Jest globals
 * into the app bundle; `app-group-layout.test.tsx` records the resulting
 * crash ("Property 'jest' doesn't exist").
 *
 * The reason this guard exists rather than a convention note: the failure is
 * invisible to every gate this project has. Typecheck passes, lint passes,
 * the test itself passes — only launching the app surfaces it. It has now
 * happened twice, the second time in six separate files at once.
 *
 * A screen's test belongs in `src/`, importing the route component by
 * relative path. `app-group-layout.test.tsx` is the working precedent.
 */
describe('no test files live under app/', () => {
  it('finds no *.test.ts(x) anywhere in the route tree', () => {
    const appDir = join(__dirname, '../../app');
    const offenders = walkAppDir(appDir, appDir).filter((f) => /\.test\.tsx?$/.test(f));
    expect(offenders).toEqual([]);
  });
});
