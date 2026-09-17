# Stack Verification Report — 2026-09-17

Sources: TypeORM issue/PR history (GitHub), pgvector-node README (raw, verified), typeorm.io docs, npm registry (`npm view typeorm`), Expo official monorepo guide, NestJS/swagger GitHub issues, TanStack Query docs/discussions.

## Q1 — TypeORM + pgvector — VERDICT: SOUND, with raw-SQL isolation for indexes/ops

- **Native support confirmed, not a rumor.** `pgvector-node` README (raw-fetched, authoritative — maintained by the pgvector org) states plainly: "TypeORM 0.3.27+ has built-in support for pgvector" and links to `typeorm.io/docs/entity/entities#vector-columns`. Cross-checked against npm registry: `typeorm@0.3.27` exists, and current published version is `1.1.1` (TypeORM crossed to 1.x in 2026) — 0.3.27's vector feature is carried forward. Two OLD community PRs (#10138, closed unmerged Jan 2025; #10789, its improved successor, also closed as stale) are **pre-native-support noise** — ignore, they predate the built-in feature landing in core.
- **Entity pattern (verified from pgvector-node README + typeorm.io docs page):**
  ```typescript
  @Column('vector', { length: 768 })
  embedding: number[]
  ```
  No custom type/transformer needed — `vector` is now a first-class TypeORM column type (also `halfvec`). `length` = dimensions.
- **Querying:** QueryBuilder handles the column and ordering-by-raw-expression, but the **distance operator itself is not a TypeORM DSL method** — you write it as a raw ORDER BY string plus `pgvector.toSql()` for parameter binding:
  ```typescript
  await repo.createQueryBuilder('item')
    .orderBy('embedding <=> :embedding')  // <=> = cosine distance
    .setParameters({ embedding: pgvector.toSql([...]) })
    .limit(5)
    .getMany();
  ```
  This is a **hybrid**, not full raw SQL — column mapping/hydration stays in TypeORM; only the operator/order expression is raw text. `find()` cannot do this (no operator support); QueryBuilder is required for any vector-similarity query.
- **HNSW indexes, `CITEXT`, GIN trigram, partial indexes:** typeorm.io's vector-columns doc section does **not** mention HNSW index creation, and there is no TypeORM decorator for `USING hnsw (... vector_cosine_ops)`, `CITEXT`, or functional GIN trigram indexes on `unaccent(lower(title))`. These are **PG-specific DDL TypeORM has no first-class API for** — confirmed by absence in official docs, not by a negative test (mildly UNVERIFIED beyond doc silence, but consistent with TypeORM's general gap around PG extension-specific index methods).
- **synchronize/migration risk:** No documented TypeORM issue about vector columns being dropped/recreated on every generate for versions ≥0.3.27 (the earlier bug reports about `DataTypeNotSupportedError` and drop/recreate loops are from **before** native support landed and no longer apply). Still, given HNSW/CITEXT/partial/GIN-trigram indexes sit outside TypeORM's DSL entirely, **`synchronize: true` should not be used in this schema regardless** — migration-generation may miss or mishandle non-decorator DDL. Standard practice, not vector-specific.

**Concrete isolation pattern:**
1. Base entity: `@Column('vector', {length: 768})` for the two vector columns — this part IS ORM-native, not raw SQL.
2. All other exotic DDL (HNSW index, CITEXT, PG enum, partial index, GIN trigram on `unaccent(lower(title))`) → hand-written TypeORM **migrations using `queryRunner.query()`** raw SQL — this is standard TypeORM practice for anything beyond core decorators, not a pgvector-specific workaround.
3. All cosine-similarity reads go through **QueryBuilder** with raw `<=>` in `.orderBy()` + `pgvector.toSql()` params — never `find()`.
4. `synchronize: false` always; migrations are hand-authored/reviewed, not auto-generated, because of the raw DDL in step 2.

**Confidence:** HIGH on entity pattern and QueryBuilder pattern (directly from maintainer README + official docs). MEDIUM on "no drop/recreate bug" (absence of evidence, not a positive confirmation test) — mitigated because migrations are hand-written anyway per step 2.

---

## Q2 — yarn version — VERDICT: Yarn 1 (classic), not Yarn 4/Berry

- Expo's **official** monorepo guide (docs.expo.dev/guides/monorepos) lists Yarn v1 Classic and Berry as both "workspace-compatible," so Expo doesn't hard-block Berry. But cross-referencing:
  - A **currently open Expo repo issue** (`expo/expo#38336`, filed 2025, still relevant 2026): `expo-doctor` fails dependency-tree checks in a Yarn Berry 4 monorepo — an unresolved friction point in exactly this configuration.
  - Community consensus (multiple sources, Yarn's own PnP docs) is unambiguous: **React Native/Expo still require `nodeLinker: node-modules`** — Plug'n'Play is not compatible with Metro's module resolution as of 2026. So choosing Berry buys you nothing (no PnP), while adding the `expo-doctor` friction above.
  - No official Expo statement recommends Yarn 4/PnP; Metro's own monorepo config (`expo/metro-config`) is written and tested against hoisted `node_modules` layouts (npm/pnpm-hoisted/yarn-classic/yarn-berry-node-modules), not PnP.
- **Yarn 1 nohoist:** still the standard mitigation for native RN packages in yarn-classic workspaces when a package needs a single resolved copy at a fixed path (autolinking assumes one `node_modules/react-native`). This remains necessary in 2026 for yarn 1; Expo's own guide describes handling hoisting-path issues via `require.resolve()` in native code as the more robust modern alternative to nohoist, but nohoist itself is still valid/used practice.

**Verdict:** Use **Yarn 1 (classic)**. It has zero linker-mode footguns, no PnP-vs-Metro dance, and is the path with the most production usage in Expo+Nest monorepos. Yarn 4 is viable ONLY if you immediately set `nodeLinker: node-modules` (forfeiting PnP's benefits entirely) and accept known `expo-doctor` friction — there's no upside over Yarn 1 for this stack.

**Config (Yarn 1), root `package.json`:**
```json
{
  "private": true,
  "workspaces": {
    "packages": ["apps/*", "packages/*"],
    "nohoist": [
      "**/react-native",
      "**/react-native/**"
    ]
  }
}
```
(Add specific native-module nohoist entries only if you hit an actual duplicate-copy error — don't nohoist speculatively; YAGNI.)

**Unverified:** whether `expo-doctor` issue #38336 has shipped a fix by Sept 2026 — worth a quick `expo-doctor` dry run before committing to Berry if the team later wants it.

---

## Q3 — @nestjs/swagger CLI plugin across workspace boundary — VERDICT: does NOT work; keep DTOs in `apps/api`

- Multiple independent GitHub issues confirm the CLI plugin (the one that infers `@ApiProperty()` via TS AST from `.dto.ts` files) is **compile-pass-scoped to the Nest project it's configured against** — it does not walk into `node_modules`/external workspace packages:
  - `nestjs/nest#6982` — "Swagger CLI plugin does not work in a monorepo."
  - `nestjs/swagger#893` — open feature request asking for a `dtoFilePaths`/pattern option to point the plugin at external paths — **doesn't exist today**, confirming there's no supported way to extend its scan scope.
  - `nrwl/nx#33337` and `nestjs/swagger#801` — Nx/webpack-specific manifestations of the same root cause (metadata not resolved for out-of-project types), with webpack mode making it worse (empty schemas even for correctly-scanned files).
- Root cause is consistent across all three reports: the plugin's TS transformer only processes files inside the compilation unit it's invoked on (governed by `tsconfig`'s `include`/`rootDir`), so a shared `packages/shared` DTO is invisible to it regardless of package-manager hoisting behavior.

**Options weighed:**
| Option | One source of truth? | Effort | Verdict |
|---|---|---|---|
| Explicit `@ApiProperty()` decorators in shared package | Yes | Low — decorators live with the class | Works, but couples `packages/shared` to `@nestjs/swagger` as a dependency even though the mobile client never uses it |
| Keep DTOs in `apps/api`, generate client types from OpenAPI JSON | Yes | Medium — needs an `openapi-typescript`/`orval` codegen step | Cleanest separation; client never imports Nest-specific decorators |
| Duplicate types in each app | No | — | Rejected — violates DRY, the exact problem being solved |

**Recommendation:** Keep request/response DTOs in `apps/api` with explicit `@ApiProperty()` (skip the CLI plugin's auto-infer entirely — don't fight a plugin that structurally can't see external packages), then **generate typed client bindings from the emitted OpenAPI JSON** (e.g. `openapi-typescript`) into `packages/shared` or directly into the Expo app at build/dev time. This gives ONE source of truth (the Nest DTOs), keeps the plugin working normally (no cross-package inference needed), and the client gets accurate types without manual duplication. Reserve `packages/shared` for things that are genuinely framework-agnostic (enums, constants, pure validation schemas) — not full API DTOs.

---

## Q4 — axios+Zustand vs axios+TanStack Query — VERDICT: TanStack Query v5

**Cost of Zustand-only** (hand-built, per requirement):
- Cache keying: manual map/object keyed by endpoint+params — Zustand gives you a store, not a cache with expiry semantics.
- Request dedup (avoid duplicate in-flight fetches for same key): must build yourself (e.g. a pending-promises map) — no built-in.
- Stale invalidation on WS `processing_status` events: must wire manual subscription → store mutation, plus a TTL/staleness marker per entry, all hand-rolled.
- Cursor-paginated infinite lists: fully custom pagination-state reducer per list (cursor tracking, in-flight guard, append/dedupe logic) — this is the single largest chunk of hand-built code for 45 endpoints, repeated per list unless you build a generic hook (which is itself reinventing `useInfiniteQuery`).
- Net: for ~45 endpoints with infinite lists + WS invalidation, Zustand-only means building a bespoke, undertested mini-version of TanStack Query's core feature set.

**TanStack Query v5 in Expo/RN:** Official docs (`tanstack.com/query/v5/docs/framework/react/react-native`) document first-class React Native support including `onlineManager`/`AppState` integration for refetch-on-foreground and network-state handling via Expo's Network module — this is an officially documented, maintained integration, not a community bolt-on. Known friction reported in community discussions (GitHub Discussions #7180, #3727, #7423) is narrow and solvable: (1) stale-data-after-invalidation edge cases tied to specific `refetchType`/`cancelRefetch` combinations — avoidable by using default invalidation instead of the `{refetchType:'none'}` shortcut; (2) an old (v4-era) issue with queries not executing, since resolved. No structural incompatibility with Expo/RN was found across any source.

**Verdict:** **axios + TanStack Query v5.** It ships infinite-query pagination, cache keying, dedup, and invalidation (exactly what the WS `processing_status` events need to trigger via `queryClient.invalidateQueries`) out of the box, is officially documented for RN/Expo, and matches the project scale (45 endpoints) where hand-rolling this in Zustand would be a meaningful, ongoing maintenance liability with no compensating benefit — Zustand still has a place for pure client/UI state (e.g. auth token, UI toggles), just not as the data layer. The axios single-flight refresh interceptor on 401 is orthogonal to either choice and implemented the same way regardless (axios interceptor with a shared in-flight refresh promise).

---

## Limits / Unverified
- Q1: No first-hand test of whether TypeORM's migration **generator** (not `synchronize`) silently mishandles the vector column type in 1.x — mitigated by recommending hand-written migrations regardless (needed for HNSW/CITEXT/GIN anyway), so this residual risk carries no practical cost.
- Q2: Whether `expo/expo#38336` (expo-doctor + Yarn Berry) has been fixed by Sept 2026 was not directly confirmed (issue tracker snapshot may be stale) — moot given Yarn 1 is the recommendation.
- Q3: Did not verify current NestJS/swagger version numbers or whether a `dtoFilePaths`-style option shipped very recently — the issue (#893) was open at last check; recommend a quick `npm view @nestjs/swagger versions` + changelog scan before implementation to catch any 2026 fix.
- Q4: Did not benchmark bundle-size delta of adding TanStack Query to an Expo app — assumed acceptable given its ubiquity in the RN ecosystem; not independently measured here.
