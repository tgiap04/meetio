# Reviewer report — Phase 15 (GraphRAG question answering)

## Scope
- API: `apps/api/src/qa/*` (retriever, qa.service, answer-generator, context-builder, qa-history, qa.controller, dto), `ai/ai-http-error.ts`, `search/search.service.ts` refactor, `graph/name-normalizer.ts` (keepDiacritics/hasDiacritics), migration `1758000000018-AddQaAnswerState`, `qa-message.entity.ts`, `app.module.ts`
- test-support: `fake-gemini-server.ts` answer dispatch, `chunking/__tests__/fake-gemini.ts` embedTexts capture
- `scripts/qa-live-check.mjs`, `.env.example`
- `packages/shared/src/qa/qa.types.ts`
- Mobile: `app/(app)/ask.tsx`, `app/(app)/meeting-chat.tsx`, `src/components/qa/*`, `src/components/citation-chip.tsx`, `src/components/meeting-detail/ask-ai-fab.tsx`, `src/hooks/use-qa-*`, `src/api/qa.ts`
- Lines: ~660 API qa module + shared types, ~1150 mobile qa surface, all files under the 200-line guidance
- Depth: full read of every touched file, plus the pre-existing indexes/tables/throttler infra the new code depends on

## Assessment
Solid, carefully-designed implementation that follows its own plan closely. Every SQL statement in the retrieval path filters by `user_id` (or joins through a table that does), the no-context gate genuinely skips the model call (asserted by test with `calls.generate === 0`), citation mapping is a closed-set filter against known passage labels (defeats prompt injection trying to fabricate sources), the 30/hour throttle is correctly scoped to only the two POST routes via named-limit override, and NFR-04 (no question/answer text in logs) holds — the only log line in the qa module logs a user id, never content. Live evidence (6/6 answerable with citations, 4/4 out-of-scope correctly "not found", p95 3.1–3.8s) backs the acceptance criteria that can be measured without real user data. Found one real mobile-only bug (duplicate messages after an app-background/foreground cycle) and a few lower-severity items below.

## Critical
None.

## High
None. (The mobile duplicate-message issue is real but not critical — see Medium.)

## Medium

1. **Mobile: sent messages can duplicate after the app backgrounds and foregrounds mid-thread.**
   `apps/mobile/src/hooks/use-qa-thread.ts:66` builds the rendered list as `[...history.items, ...sentMessages]` with no id-based dedup, and `qa-thread-list.tsx:42-53` renders every row in that array (a duplicate `id` only produces a React key warning, not exclusion). `use-qa-mutations.ts` deliberately does not invalidate the history query cache on ask — by design, the composer never waits on a refetch round-trip; instead `sentMessages` accumulates locally. But `apps/mobile/src/query/query-client.ts:28-32` wires TanStack Query's `focusManager` to `AppState`, and the default `refetchOnWindowFocus` is `true` with `staleTime: 30_000`. So: ask a question, background the app for >30s while the answer is stored server-side, foreground it again while the same chat screen is still mounted → the history query refetches, now includes the just-answered turn from the server, and it renders a second time alongside the still-populated `sentMessages`. This is a believable real-use sequence (send a question, get pulled away by a phone call or lock screen, come back).
   Fix: dedup `items` in `useQaThread` by `id` (e.g. keep a `Map` keyed by id, history entries winning ties), or clear `sentMessages` entries once they appear in a freshly-fetched history page. Either is a small, local change in `use-qa-thread.ts`.

2. **`AnswerGenerator.parseAnswer`'s "no valid citation" case reports `low_confidence` inconsistently with the documented reason.** `answer-generator.ts:98` sets `confidence: cited.length ? stated : Math.min(stated, CONFIDENCE.low)` — when the model claims `high`/`medium` confidence but every cited label turns out invalid, the stored value becomes exactly `0.3` (`CONFIDENCE.low`), and `qa-history.ts:67`'s `low_confidence` flag fires only when `confidence < LOW_CONFIDENCE (0.5)`. `0.3 < 0.5` so this does correctly surface as `low_confidence: true` — confirmed by `qa-core.spec.ts:45-47`. Not a bug; noting only because the two independent thresholds (`CONFIDENCE.low = 0.3`, `LOW_CONFIDENCE = 0.5`) are defined in two different files and their relationship (0.3 < 0.5, so the "no citation" path always ends up low_confidence) is not obvious without cross-referencing both — worth a one-line comment in one file pointing at the other so a future change to either constant doesn't silently break the invariant.

## Low

3. **`qa.controller.ts`'s `GET /qa` and `GET /meetings/:id/qa` share the `UserThrottlerGuard` but no `@Throttle` override**, so they fall back to the global `default` limiter (300/min/user, `app.module.ts:39`). That's intentional and consistent with the rest of the codebase (`AuthController` does the same override pattern), but it's worth confirming 300/min is still an acceptable ceiling for a history-polling GET now that Q&A screens exist — not a Phase-15-specific concern, just flagging since this phase adds new GET traffic.

4. **`retriever.ts:113-116`** re-derives `hasDiacritics`/`keepDiacritics` per line of the search text on every call; for a two-line follow-up query this is negligible, but if `HISTORY_TURNS`-style context ever grew to include more lines here it would scale linearly with entity anchor count (`ENTITY_ANCHORS × lines`). Fine at current sizes (10 anchors × ≤2 lines).

## Edge Cases Turned Up
- **Cross-user entity filter** (`askGlobal` with someone else's `entity_id`): correctly 404s (`qa.service.ts:58-63`, proven by `qa.e2e.spec.ts:78-82`).
- **Meeting not yet processed**: `assertMeetingReady` correctly distinguishes "nothing to answer from" (409 `MEETING_NOT_READY`) from a genuine "not found" answer — proven by `qa.integration.spec.ts:175-184`.
- **Citation pointing at a re-cut/deleted chunk**: correctly marked `available: false` rather than a dead link or a wrong jump target (`qa-history.ts:42-50`, `qa.integration.spec.ts:180-183`).
- **Accent-blind false positive** ("cuối tuần" matching a person named "Tuấn"): found and fixed via `keepDiacritics`, proven with both the accented and unaccented phrasing in the same test (`qa.integration.spec.ts:128-144`) — also independently confirmed by the live-check report, which is a good sign the same defect was caught two different ways.
- **Global history pagination cursor** uses `(created_at, id) < (subquery)` with `clock_timestamp()` on insert, which correctly breaks ties when two messages land in the same millisecond (question+answer inserted in the same transaction) — checked the tuple comparison is well-formed Postgres row-comparison syntax, not string concatenation.
- **Empty/whitespace-only question**: rejected by DTO validation (`@Matches(/\S/)`), proven at `qa.e2e.spec.ts:69` (400).
- **Follow-up search concatenation picking up an unrelated adjacent question**: acknowledged as a known, measured trade-off in the live-check report (model still resolves it correctly 4/4 in that sample) — user decision, not re-litigated here.

## Done Well
- Retrieval SQL is a single reusable `SCOPE` fragment (`retriever.ts:77-80`) shared by `chunkAnchors` and `expand`, so the user/meeting/date/entity filter can't drift between the two query sites — a real defense against the class of bug where one of two "same" queries quietly loses a filter clause.
- The no-context gate is enforced before any model call, not just documented — `calls.generate === 0` is asserted directly in tests, not merely implied by the presence of a `not_found` result.
- Citation mapping (`parseAnswer`) treats the model's `sources` as untrusted input and filters it against the actual known passage set — a clean, structural mitigation against prompt injection trying to fabricate a citation or leak passages that were never in context.
- `dayBound`'s hardcoded `+07:00` is a correct simplification, not a shortcut — Vietnam has no DST, so a fixed offset is actually right, and the test pins the exact UTC boundary conversion.
- The `aiErrorToHttp` extraction out of `search.service.ts` into a shared helper (now reused by `qa.service.ts`) is a good, low-risk dedup that a previous phase would have wanted.

## Actions In Order
1. Fix the mobile duplicate-message case in `use-qa-thread.ts` (dedup by `id` when combining `history.items` and `sentMessages`).
2. Optional: cross-reference comment between `CONFIDENCE.low` (`answer-generator.ts:20`) and `LOW_CONFIDENCE` (`qa-history.ts:7`) so the invariant they jointly rely on is documented in one place.

## Numbers
- Type coverage: both API and mobile `typecheck` pass (temper-results.json), no `any` introduced in the reviewed diff
- Test coverage: 8/8 temper commands pass — API unit 377, e2e 127, schema 5, mobile 1050 (all green per temper-results.json, 2026-09-26T16:35–16:36)
- Lint findings: 0 (`eslint --max-warnings=0` clean per temper-results.json)
- Live evidence (plans/reports/live-2026-09-26-gemini-phase-12-13.md, Phase 15 section): p95 3.1s/3.8s (NFR <5s, pass); 6/6 answerable correct with citations incl. one genuine cross-meeting citation; 4/4 out-of-scope correctly "not found"; similarity gate 0.6 separates answerable (0.61–0.76) from unanswerable (0.55–0.59) with a narrow but real margin

## Still Unresolved
- **Genuinely unproven, honestly recorded in the plan file itself**: the 30-question gold set over 10 real meetings (citation-accuracy ≥90%, zero hallucination) needs real user data and has not been run. This is the phase's own explicitly-acknowledged gap, not something this review can close.
- The narrow live-measured similarity margin (0.613 vs 0.593 best-chunk score) means `QA_MIN_SIMILARITY=0.6` is a reasonable default but not a wide safety margin — worth revisiting once the gold set exists.

**Status:** DONE_WITH_CONCERNS
**Summary:** Phase 15 GraphRAG Q&A is well-built and matches its plan and clarifications; user isolation, the no-context gate, citation-injection defense, and the per-route throttle all hold up under direct inspection and are proven by tests, not just asserted. One real (Medium, not Critical) mobile bug found: duplicate chat bubbles possible after an app background/foreground cycle mid-thread, from `useQaThread` combining local `sentMessages` with a refetched history page with no id dedup. The plan's own gold-question-set acceptance criterion remains honestly unproven pending real user data.
**Concerns/Blockers:** The mobile duplicate-message bug should be fixed before this ships to real users, though it does not block sealing the phase's other acceptance criteria.

## Re-check (2026-09-27)

The Medium finding (mobile duplicate-message bug) is fixed and verified: `use-qa-thread.ts:66-69` now filters `sentMessages` against a `known` set built from `history.items` ids before combining, and `use-qa-thread.test.tsx:98-117` proves it directly (a history refetch that already contains the sent pair renders it once, not twice).

Also verified since the first pass:
- `qa.integration.spec.ts:187-200` — new end-to-end QUOTA_EXCEEDED coverage: budget exhausted → 429 with code `QUOTA_EXCEEDED`, and nothing is stored in history (proves the insert transaction never partially commits when the AI call is rejected pre-generation).
- The two previously any-typed monkeypatch tests are now driven through the real fake-Gemini reply sequence (`qa.integration.spec.ts:279-309`): schema retry (bad, bad, good → 3 calls, stored) and total failure (3 bad → 503, nothing stored) and low-confidence-on-unknown-labels are all now proven end to end rather than against mocked internals.
- New pagination-cursor walk (unit + e2e), DELETE-scoped-to-one-meeting, meeting-scope graph-expansion isolation, and merged-away-entity 404 tests all hold up against the actual code paths they claim to cover.
- temper-results.json rebuilt with real exit codes, 8/8 pass, counts up from the first round (api unit 377→387, e2e 127→130, mobile 1050→1051).

Score raised 8→9. Decision remains **BLOCKED** — not because anything regressed, but because the plan's own gold-question-set acceptance criterion (30 questions over 10 real meetings) still genuinely cannot be demonstrated without real user data, same as the first pass and consistent with the phase-14 precedent for an identical situation.

**Status:** DONE_WITH_CONCERNS
**Summary:** Reported Medium fixed and verified with a real regression test; several other test-quality improvements verified (any-typed monkeypatches replaced, new QUOTA_EXCEEDED/pagination/isolation coverage). No new issues found. Gate re-run: still BLOCKED, solely on the pre-existing, honestly-recorded unproven gold-set criterion.
**Concerns/Blockers:** None new. The gold-question-set criterion remains open pending real meeting data.
