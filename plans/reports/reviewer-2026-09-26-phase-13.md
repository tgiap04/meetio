# Review: Phase 13 — Graph extraction & entity resolution

## Re-review (2026-09-26, same day)

All findings from the first pass are fixed and independently re-verified against the actual code (not just the
coordinator's description):

- **Critical fixed** — `meeting-deletion.service.ts:35-36` now takes `EntityResolver.lockUserGraph` as the
  transaction's first statement, before `meetings.lockOwned`. No other transaction acquires the meeting-row lock
  before the graph lock, so this ordering adds no deadlock. Proven by a new deterministic e2e
  (`graph.e2e.spec.ts:263-289`) that holds the graph lock in a second connection, confirms the DELETE is still
  pending after 400ms, inserts a new mention, commits, and confirms the entity survives with `mention_count: 1`.
- **Medium fixed** — `graph-overview.service.ts:20` `meetingGraph` node query now filters `e.user_id = $2`.
- **Low fixed** — `graph-overview.service.ts:41-45` suggestions query now requires `a.type = b.type` at read time,
  hiding a suggestion once a later edit makes the pair's types diverge.
- **New High found during rework, not by me** — `entity-query.service.ts:19-21`: a search string with no letters or
  digits (e.g. `"%"`) normalized to `""`, which matched every entity. Now short-circuits to an empty page. Covered
  by `graph.e2e.spec.ts:178-181`.
- Test rework re-read and confirmed non-vacuous: the "concurrent resolve" test now runs 4 meetings resolving the
  same new name (`anh Bình`) concurrently via `Promise.all` and asserts one entity/4 mentions
  (`graph-pipeline.integration.spec.ts:209-216`) — this actually exercises the advisory lock, unlike the prior
  sequential/different-names version. Self-loop-undo and flattened-merge tests now go through the real
  `EntityMergeService.merge/undo` instead of hand-built SQL snapshots (`graph-pipeline.integration.spec.ts:195-207`).
- `temper-results.json` read directly: 8/8 real exit 0 — unit 332 (+3), e2e 105 (+10), schema 5, mobile 915 (+1),
  both typechecks and eslint clean. Deltas are consistent with the described rework (new lock-order e2e, wildcard/
  empty-q e2e, PATCH-type-renormalize e2e, merge-suggestions undo test, etc.).
- Remaining, unchanged: Gemini live behavior, the 60-min/<2-min NFR, and OQ-03 gold-dataset calibration are still
  unproven — correctly, since none of this round's fixes touch that. One Low item (relation-matching `find()`
  re-normalization in `extraction-schema.ts:110`) remains deferred, unaddressed, non-blocking.

**criticalCount: 0.** The evidence gate at hard stage still blocks — correctly — because `unproven` is non-empty
(no code change can resolve "needs a live Gemini key" or "needs a real 10-meeting gold dataset"). Decision recorded
as `BLOCKED` rather than `SEALED`: nothing here is a defect to fix, but the phase cannot be sealed at hard stage
until those two external dependencies are supplied.

**Status:** DONE_WITH_CONCERNS (concern = external dependency, not a code defect)

---

## Original review

## Scope
- Files reviewed: `apps/api/src/graph/**` (20 files, 1740 lines incl. tests), `apps/api/src/ai/gemini.client.ts` diff,
  migration `1758000000016-AddGraphPipelineState.ts`, `entity-record.entity.ts`, `meeting-chunk.entity.ts`,
  `meetings/meeting-deletion.service.ts`, `app.module.ts`, `scripts/entity-resolution-eval.ts`, `test-support/*`,
  `packages/shared/src/graph/graph.types.ts`, and mobile: `app/(app)/entities.tsx`, `entity-detail.tsx`,
  `merge-suggestions.tsx`, `src/components/entities/**`, `src/components/knowledge-graph/**`, `src/hooks/use-entit*`,
  `use-meeting-graph-query.ts`, `src/api/entities.ts`, `src/components/search/entity-search-sections.tsx`.
- Lines: ~1740 (api/graph) + ~1200 (mobile new/changed, estimate).
- Depth: full read of every non-test production file, full read of both graph integration/e2e suites, diff-only for
  gemini.client.ts / entities / app.module.ts / test-support.

## Assessment
Strong, disciplined implementation. Every acceptance criterion in `study-context.json` has a corresponding, real
integration or e2e test (not just unit-mocked): one project across 3 meetings → 1 entity/3 mentions; retry-then-skip
on schema failure; citation-checked relations; suggest-only vector tier with env-configured thresholds;
alias-preserving merge + 30-day undo; `is_user_edited` immunity; permanent suggestion rejection; per-user isolation
including a cross-user 404 sweep across every route. File sizes all stay under the ~200-line guidance. SQL is
parameterized throughout — no injection surface found. NFR-04 (no transcript/model text in logs) holds: the only
`logger.warn` calls in the extract step emit chunk ids and a short Vietnamese schema-violation reason, never model
text. The `UPDATE/DELETE … RETURNING` → `[rows, count]` vs `INSERT … RETURNING` → `rows` asymmetry that the code
comments call out is real (confirmed against the pre-existing `pipeline-store.ts` precedent) and every call site in
this diff uses the form matching its own statement type — no bug there.

One real concurrency gap stood out under the "races between resolve, merge, edit and meeting deletion" instruction
below (Critical). Everything else is polish-level.

## Critical

1. **`meeting-deletion.service.ts` never takes the user's graph advisory lock, so it is not serialized against
   resolve/merge/edit/undo — a concurrent resolve can lose an entity to an incorrect orphan-delete.**
   `apps/api/src/meetings/meeting-deletion.service.ts:29-56`
   Every other graph writer (`ResolveStepHandler.run` cleanup, `EntityMergeService.merge/undo`,
   `EntityEditService.update/remove`) opens with `EntityResolver.lockUserGraph(m, userId)` precisely so concurrent
   writers to one user's graph serialize (`apps/api/src/graph/entity-resolver.ts:35-37`, and used at
   `resolve-step.handler.ts:39`, `entity-merge.service.ts:43,102`, `entity-edit.service.ts:21,45`). Meeting deletion
   only takes `meetings.lockOwned` — a row lock on `meetings`, not the graph advisory lock — before reading
   `entity_mentions` for the meeting and deleting orphans.
   Concrete race: entity `E` currently has its only mention in meeting `X` (about to be deleted). Concurrently, the
   `resolve` step for a *different* meeting `Z` (holding the graph lock) attaches a brand-new mention of `E` and
   commits. If that commit lands between meeting-deletion's `SELECT entity_id FROM entity_mentions WHERE meeting_id =
   $1` and its orphan-delete `WHERE ... NOT EXISTS (entity_mentions ...)` — both unguarded by the graph lock — the
   orphan check can still observe the pre-commit state at read time in READ COMMITTED (each statement takes a fresh
   snapshot, so this specifically requires the resolve commit to land in the gap between meeting-deletion's own two
   statements), and `E` — which now has a live, freshly-committed mention in meeting `Z` — gets deleted anyway. The
   entity, its new mention, and any relations resolve just inserted for it disappear silently: unrecoverable data
   loss with no error surfaced to either party. The same is true against a concurrent merge/undo/edit that changes
   which entity a meeting's mentions point to.
   **Fix:** take `await EntityResolver.lockUserGraph(manager, userId)` as the first statement inside
   `MeetingDeletionService.delete`'s transaction, exactly like the other four call sites. This is a one-line, safe
   fix — deletion already runs inside a transaction and already loads `EntityResolver`-adjacent code paths elsewhere
   in the module graph (`GraphModule` and `MeetingsModule` are both Nest modules over the same `DataSource`; no new
   coupling is needed beyond importing `EntityResolver`).
   No existing test exercises this path — `graph.e2e.spec.ts:166-176` ("deleting the only meeting that mentions a
   merged entity...") runs deletion and merge *sequentially*, not concurrently, so it does not catch this.

## High
None beyond the above.

## Medium

2. **`GraphOverviewService.meetingGraph` node query doesn't filter by `user_id` directly — it's safe only because of
   an invariant it doesn't restate.** `apps/api/src/graph/graph-overview.service.ts:16-22`
   `SELECT ... FROM entity_mentions em JOIN entities e ON e.id = em.entity_id WHERE em.meeting_id = $1` relies on the
   fact that a meeting's mentions can only ever reference that meeting's owner's entities (enforced by the resolve
   step, not by this query). The ownership check above it (`owned` on `meetings`) makes this safe today, but it's a
   single missing `AND e.user_id = $2` away from becoming a real cross-user leak if a future change ever lets mentions
   reference another user's entity (e.g. a shared-graph feature) or if a bug elsewhere inserts a bad row. The
   `edges` query two lines down already carries `AND r.user_id = $2` — add the matching filter to `nodes` for
   defense in depth and query-shape consistency.

3. **`EntityListQueryDto.q` truncates only via `@Length(1,100)` but `normalizeEntityName` + `likeEscape` run on
   every request regardless of hit rate; no rate limiting/backoff is specific to this endpoint.** Not a new problem
   introduced by this phase (global throttler presumably covers it — not verified here), noting for completeness
   only. No fix required unless the throttler config excludes `/entities`.

## Low

4. **`extraction-schema.ts:110`** — `find = (n) => chunk.entities.find((e) => normalizeEntityName(n, e.type) ===
   normalizeEntityName(e.name, e.type))` computes `normalizeEntityName(e.name, e.type)` fresh per candidate inside a
   loop that already built `known` maps of normalized names during entity parsing a few lines above (`known.get
   (label)!.set(key, name)`). Reusing that map instead of re-normalizing per relation would be a small dedup/clarity
   win — no correctness issue, `known` is scoped per-label and would need to carry through to the relations loop.

5. **Stale merge suggestion after a type edit.** `EntityResolver.suggest` records a same-type constraint at
   creation time (`entity-resolver.ts:64,77`), but if a user later edits an entity's `type` via `PATCH /entities/:id`
   (`entity-edit.service.ts:19-40`), an existing `entity_merge_suggestions` row for that entity is left un-invalidated
   and could still surface a "duplicate" suggestion between now-different-typed entities. Narrow edge case (edit type
   + pre-existing suggestion), not covered by tests; worth a follow-up but not blocking.

## Edge Cases Turned Up

- **Self-loop relations** ("Bình" and "anh Bình" resolving to the same entity id) are explicitly dropped both at
  extraction time (`resolve-step.handler.ts:69`) and at merge time (`entity-merge.service.ts:66-71` deletes and
  snapshots any relation that would become a self-loop, restoring it on undo only if both ends still exist) —
  correctly handled and tested (`graph-pipeline.integration.spec.ts:36-58`).
- **Concurrent same-user extraction** (two meetings resolving simultaneously) is correctly serialized via the
  per-user advisory lock and tested for tier-1 dedup across meetings; but see Critical #1 for the one writer that
  does *not* take that lock.
- **30-day undo boundary and double-undo** both return the correct `409 INVALID_STATE_TRANSITION` and are tested
  (`graph.e2e.spec.ts:117-134`).
- **Orphan cleanup racing a rename**: `is_user_edited` guards both the orphan-delete (`resolve-step.handler.ts:41`)
  and alias/description overwrite paths (`entity-resolver.ts:58-59,96`) — consistently checked everywhere the
  pipeline could touch a user's edit.
- **`jsonb_populate_recordset(NULL::relations, ...)` in undo** exactly matches the `relations` table's column
  set (verified against `1758000000005-CreateRelationTables.ts`), and the restore is itself re-guarded by `EXISTS`
  checks against `meeting_chunks`/`entities` so a relation whose meeting/chunk was deleted in the meantime is
  silently dropped rather than violating an FK — correct defensive design.

## Done Well

- Every finding the task asked me to hunt for (except #1) came back clean: user-id filtering is consistent and
  tested with a real cross-user 404 sweep (`graph.e2e.spec.ts:84-98`); idempotency of extract/resolve under retry is
  proven by an explicit "no-op when run again: no second mention, no second model call" test
  (`graph-pipeline.integration.spec.ts:80-90`); the schema/citation defense against prompt injection is layered
  (JSON structure → enum → per-chunk citation → per-chunk entity membership) and throws vs. drops are cleanly
  separated (structural failure retries, unbackable content is silently dropped); `ENTITY_SUGGEST_THRESHOLD` /
  `ENTITY_AUTO_MERGE_THRESHOLD` are environment-driven with auto-merge off by default, matching the clarified
  decision exactly.
- The merge/undo snapshot design (`MergeSnapshot`) is genuinely complete — mentions, both relation directions,
  dropped self-loops, and child re-merges are all captured and precisely reversed, and the undo is re-guarded against
  a "merged further since" race (`still_merged` check, `entity-merge.service.ts:105-116`).
- Mobile stays a thin, contract-faithful client: no redeclared wire shapes, cache invalidation lists exactly the
  query keys each mutation can affect, auth token handling is centralized and untouched.
- Honest incompleteness: the plan file explicitly and correctly marks the OQ-03 gold dataset and the 60-min/2-min
  NFR as blocked on a live key, rather than papering over them with a fake benchmark.

## Actions In Order
1. Add `EntityResolver.lockUserGraph(manager, userId)` as the first statement in
   `MeetingDeletionService.delete`'s transaction (Critical #1).
2. Add `AND e.user_id = $2` to the `nodes` query in `GraphOverviewService.meetingGraph` (Medium #2).
3. Optional: invalidate/re-check same-type constraint on existing merge suggestions when an entity's type is edited
   (Low #5).

## Numbers
- Files touched in scope, all ≤ 200 lines (largest: `graph.e2e.spec.ts` at 177, `graph-pipeline.integration.spec.ts`
  at 158; all production files ≤ 142 lines).
- Orchestrator-reported gate: api unit 329, e2e 95 (+1 new), schema 5, mobile 914, typecheck/eslint clean — all real
  exit codes per the task brief; not independently re-run in this review pass.
- Lint/type findings from this review: 0 (no `any`, no empty catches, no string-built SQL found anywhere in scope).

## Still Unresolved
- Live Gemini behavior (`responseSchema` structured output, `SEMANTIC_SIMILARITY` embeddings) — unproven, needs a
  real `GEMINI_API_KEY`.
- "60-minute meeting extracted under 2 minutes" — unproven, needs a real key.
- OQ-03 gold-dataset calibration — `scripts/entity-resolution-eval.ts` is ready and correctly wired (confirmed by
  reading it) but has never been run against real data; thresholds (`0.85` suggest, auto-merge off) are therefore
  provisional defaults, not calibrated values.
- Critical #1 (meeting-deletion advisory lock) is a real, fixable gap — recommend fixing before this phase seals.

**Status:** DONE_WITH_CONCERNS
