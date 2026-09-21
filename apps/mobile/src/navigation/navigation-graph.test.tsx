import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import * as appRoutes from './app-routes';

/**
 * Phase 13's tap audit. Proves the navigation graph as data, per
 * `phase-13-navigation-integration-and-tap-audit.md`'s architecture section —
 * it does not render a navigator (no `@testing-library/react-native` in this
 * tree, no Detox, no Maestro). It reads route constants, file paths, and the
 * screens' own source text, the same evidence a code reviewer would use.
 *
 * What this suite proves: every route constant resolves to a real file, the
 * recording chain is a connected path of `router.push` calls, screens 09/10
 * agree with screen 08 on the `?id=` param name, and no route constant in
 * `app-routes.ts` is orphaned. What it CANNOT prove: that Expo Router's
 * runtime resolver actually walks these paths on a device, that a tap lands
 * where the source claims, or that nothing crashes on render. That gap is
 * closed only by the manual simulator walk recorded in the phase-13
 * hand-back, not by this file.
 */

const appDir = join(__dirname, '../../app');
const srcDir = join(__dirname, '..');

/**
 * Converts a route string (`'/(app)/(tabs)/library'`) to the file it must
 * resolve to under `app/`. A trailing parenthesised segment is a group, which
 * resolves to that group's `index.tsx`; anything else is a leaf file.
 */
function routeToFilePath(route: string): string {
  const segments = route.split('/').filter(Boolean);
  const last = segments[segments.length - 1];
  const isGroup = last.startsWith('(') && last.endsWith(')');
  return isGroup ? join(...segments, 'index.tsx') : join(...segments.slice(0, -1), `${last}.tsx`);
}

function readAppFile(relativePath: string): string {
  return readFileSync(join(appDir, relativePath), 'utf8');
}

/** Every `.ts`/`.tsx` file under `dir`, recursively, as absolute paths. */
function walkFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      return walkFiles(full);
    }
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

const ALL_SOURCE_FILES = [...walkFiles(appDir), ...walkFiles(srcDir)];

/** Whether the whole-word identifier `name` appears in any file other than `excludePath`. */
function isReferencedElsewhere(name: string, excludePath: string): boolean {
  const pattern = new RegExp(`\\b${name}\\b`);
  return ALL_SOURCE_FILES.some((file) => {
    if (file === excludePath) {
      return false;
    }
    return pattern.test(readFileSync(file, 'utf8'));
  });
}

describe('every APP_ROUTES value resolves to a file that exists under app/', () => {
  const entries = Object.entries(appRoutes).filter(([, value]) => typeof value === 'string');

  it.each(entries)('%s -> %s', (_name, route) => {
    const filePath = routeToFilePath(route as string);
    expect(existsSync(join(appDir, filePath))).toBe(true);
  });
});

describe('the recording chain is a connected path (Home -> 05 -> 06 -> 07 -> 08)', () => {
  it('Home pushes RECORDING_SETUP_ROUTE (consented) or CONSENT_ROUTE (not yet consented)', () => {
    const source = readAppFile('(app)/(tabs)/index.tsx');
    expect(source).toContain('RECORDING_SETUP_ROUTE');
    expect(source).toContain('CONSENT_ROUTE');
  });

  it('recording-setup (05) pushes RECORDING_LIVE_ROUTE (06)', () => {
    expect(readAppFile('(app)/recording-setup.tsx')).toContain('RECORDING_LIVE_ROUTE');
  });

  it('recording-live (06) pushes RECORDING_DONE_ROUTE (07)', () => {
    expect(readAppFile('(app)/recording-live.tsx')).toContain('RECORDING_DONE_ROUTE');
  });

  it('recording-done (07) pushes MEETING_DETAIL_ROUTE (08) and MEETING_GRAPH_ROUTE (10)', () => {
    const source = readAppFile('(app)/recording-done.tsx');
    expect(source).toContain('MEETING_DETAIL_ROUTE');
    expect(source).toContain('MEETING_GRAPH_ROUTE');
  });

  it('meeting-detail (08) pushes MEETING_TRANSCRIPT_ROUTE (09) and MEETING_GRAPH_ROUTE (10)', () => {
    const source = readAppFile('(app)/meeting-detail.tsx');
    expect(source).toContain('MEETING_TRANSCRIPT_ROUTE');
    expect(source).toContain('MEETING_GRAPH_ROUTE');
  });
});

describe('screens 09 and 10 agree with screen 08 on the ?id= param name', () => {
  it('screen 08 pushes both sub-screens with params: { id: ... }', () => {
    const source = readAppFile('(app)/meeting-detail.tsx');
    expect(source).toMatch(/pathname:\s*MEETING_TRANSCRIPT_ROUTE,\s*params:\s*\{\s*id:/);
    expect(source).toMatch(/pathname:\s*MEETING_GRAPH_ROUTE,\s*params:\s*\{\s*id:/);
  });

  it('screen 09 (transcript) reads the same `id` param name via useLocalSearchParams', () => {
    const source = readAppFile('(app)/meeting-transcript.tsx');
    expect(source).toMatch(/useLocalSearchParams<\{\s*id\?:\s*string\s*\}>/);
  });

  it('screen 10 (graph) reads the same `id` param name via useLocalSearchParams', () => {
    // Was a real gap until this phase: screen 10 accepted no `id` at all,
    // while screen 08 pushed one. Fixed in meeting-graph.tsx (see its
    // doc comment) rather than left for this test to merely report.
    const source = readAppFile('(app)/meeting-graph.tsx');
    expect(source).toMatch(/useLocalSearchParams<\{\s*id\?:\s*string\s*\}>/);
  });
});

describe('every stacked screen (non-tab) has a real back edge', () => {
  const stackedScreens = [
    '(app)/consent.tsx',
    '(app)/meeting-detail.tsx',
    '(app)/meeting-transcript.tsx',
    '(app)/meeting-graph.tsx',
    '(app)/recording-setup.tsx',
    '(app)/recording-live.tsx',
    '(app)/recording-done.tsx',
  ];

  it.each(stackedScreens)('%s calls router.back()', (relativePath) => {
    expect(readAppFile(relativePath)).toContain('router.back()');
  });
});

describe('no route constant in app-routes.ts is orphaned', () => {
  // Tab-root routes are reached by the Expo Router `Tabs` navigator matching
  // on FILE NAME (`index`/`library`/`search`/`settings` in
  // `(tabs)/_layout.tsx`), never by a screen importing the constant and
  // calling `router.push` — so they legitimately have zero identifier
  // references outside this file, and that is not the same thing as being
  // dead. `TAB_LIBRARY_ROUTE` is the one tab route also reached by an
  // explicit push (Home's "Xem tất cả"), so it is NOT in this allowlist —
  // it goes through the normal check below.
  const reachedByTabBarOnly = new Set(['TAB_HOME_ROUTE', 'TAB_SEARCH_ROUTE', 'TAB_SETTINGS_ROUTE']);

  const entries = Object.entries(appRoutes).filter(([, value]) => typeof value === 'string');
  const appRoutesFile = join(srcDir, 'navigation/app-routes.ts');

  it.each(entries)('%s is referenced by at least one screen (or is a tab-bar-only route)', (name) => {
    if (reachedByTabBarOnly.has(name)) {
      return;
    }
    expect(isReferencedElsewhere(name, appRoutesFile)).toBe(true);
  });
});

describe('every file under app/(app) (excluding (tabs) and _layout) is reachable', () => {
  // Screens governed by a constant elsewhere in the codebase rather than
  // `app-routes.ts`: `permission.tsx` is reached via `MIC_PERMISSION_ROUTE`
  // in `route-guards.ts` / `bootstrap-route.ts`, not by a screen tap.
  const governedOutsideAppRoutes = new Set(['permission.tsx']);

  const appGroupFiles = readdirSync(join(appDir, '(app)'))
    .filter((entry) => entry.endsWith('.tsx') && entry !== '_layout.tsx');

  const routeFilePaths = new Set(
    (Object.values(appRoutes) as string[]).map((route) => routeToFilePath(route)),
  );

  it.each(appGroupFiles)('%s has a matching app-routes.ts constant (or is separately governed)', (fileName) => {
    if (governedOutsideAppRoutes.has(fileName)) {
      return;
    }
    expect(routeFilePaths.has(join('(app)', fileName))).toBe(true);
  });
});

describe('APP_HOME_ROUTE is identical in route-guards.ts and bootstrap-route.ts', () => {
  it('both files declare the same literal', () => {
    const guards = readFileSync(join(srcDir, 'navigation/route-guards.ts'), 'utf8');
    const bootstrap = readFileSync(join(srcDir, 'navigation/bootstrap-route.ts'), 'utf8');
    const guardsMatch = guards.match(/APP_HOME_ROUTE = ('.*?')/);
    const bootstrapMatch = bootstrap.match(/APP_HOME_ROUTE = ('.*?')/);
    expect(guardsMatch).not.toBeNull();
    expect(bootstrapMatch).not.toBeNull();
    expect(guardsMatch?.[1]).toBe(bootstrapMatch?.[1]);
  });
});
