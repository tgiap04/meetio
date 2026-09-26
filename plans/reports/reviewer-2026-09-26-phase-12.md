# Reviewer Report — Phase 12 (chunking, embedding, semantic search, Gemini key pool, mobile search)

Date: 2026-09-26 · Scope: uncommitted diff in `apps/api/src/{chunking,ai,search,database,common/throttler}`,
migration `1758000000015`, `apps/mobile` search/transcript wiring, `packages/shared/src/search`.

## Review Summary

### Scope
- Files reviewed (primary): `apps/api/src/chunking/chunker.ts`, `chunk-step.handler.ts`, `embed-step.handler.ts`;
  `apps/api/src/ai/gemini-key-pool.ts`, `gemini-call-runner.ts`, `gemini.client.ts`, `ai.module.ts`, `ai-errors.ts`,
  `usage-tracker.ts`; `apps/api/src/database/vector.repository.ts`, `entities/meeting-chunk.entity.ts`,
  migration `1758000000015-SplitChunkingFromEmbedding.ts`; `apps/api/src/search/*`;
  `apps/api/src/common/throttler/user-throttler.guard.ts`; `apps/api/src/pipeline/pipeline-control.service.ts`,
  `meeting-edits.ts`; `apps/mobile/app/(app)/(tabs)/search.tsx`, `meeting-transcript.tsx`,
  `src/components/transcript/real-transcript-screen.tsx`, `src/hooks/use-scroll-to-initial-seq.ts`,
  `src/utils/scroll-to-index-fallback.ts`, `src/hooks/use-segments-query.ts`; `packages/shared/src/search/*`;
  `docs/api-spec.md` §6; `apps/api/scripts/search-perf.ts`, `gemini-live-check.ts`;
  `apps/api/src/database/migrations/{1758000000004,1758000000005,1758000000006}` (FK cascade check on
  mentions/relations/action_items → chunk).
- Lines: ~921 in the core new/changed backend files above, plus mobile wiring and tests. Full diff per
  `git status`/`git diff` in the working tree.
- Depth: full read of every file above (not diff-only), plus one level into `node_modules/@google/genai` to
  confirm what a real Gemini `ApiError.message`/`.status` actually contain (this mattered for finding #1 below).

### Assessment
Solid, well-tested phase. The chunk/embed reconciliation is genuinely idempotent and scoped (proved by
integration tests, not just claimed), the search SQL is properly parameterized with the owner filter inside
the statement, and the decision to drop HNSW for exact per-user search is unusually well-documented — real
numbers at the target scale, a stated failure mode for the alternative, and a regression test asserting the
query plan stays off the HNSW index. One real defect (below, #1) in Gemini key-invalidation detection can take
the whole AI pipeline down silently and permanently (until restart) on a transient 403 unrelated to the key's
validity; that should be fixed before this ships. Several other Medium items are worth closing before Phase
13 starts building on top of `meeting_chunks`/`processing_jobs`. Nothing here reads as a security hole, an
authz gap, or a breaking change to a shipped contract.

### Critical
None found.

### High
**1. `gemini-call-runner.ts:13-14` — `isInvalidKey` will false-positive on almost any Google API 403, permanently disabling a valid key for the process lifetime.**

```ts
const isInvalidKey = (error: unknown) =>
  (statusOf(error) === 400 || statusOf(error) === 403) &&
  /API_KEY_INVALID|API key not valid|PERMISSION_DENIED/i.test(String((error as Error)?.message));
```

I traced `@google/genai`'s actual error path (`node_modules/@google/genai/dist/vertex_internal/index.js:3009`,
`throwErrorIfNotOK`): on any non-OK response it does `errorMessage = JSON.stringify(errorBody)` and throws
`new ApiError({ message: errorMessage, status })`. Google's API convention sets the JSON body's
`error.status` field to the literal string `"PERMISSION_DENIED"` for **every** HTTP 403 — API not enabled for
the project, billing disabled, IAM/org-policy denial, key restricted to a different API/referrer/IP — not
only "this key is invalid." Because the regex just substring-matches the whole stringified body, any of those
unrelated 403s will match `PERMISSION_DENIED` and call `pool.disable(slot)`
(`apps/api/src/ai/gemini-key-pool.ts:83-85`), which drops the key **for the rest of the process's life** with
no way back short of a restart. With a single-key deployment (the common case per `.env.example`) this is a
silent, total, and durable outage of chunking/embedding/search triggered by something as ordinary as a
temporarily-disabled billing account or a misconfigured API restriction — not by the key being wrong. This is
exactly the false-positive risk called out in the review brief, and it is not a corner case: `PERMISSION_DENIED`
is the standard `error.status` for the entire 403 class, so it fires on the common path, not an edge one.

Fix: narrow the signal to what Google actually uses for a genuinely bad key — HTTP 400 with
`API_KEY_INVALID`/`API key not valid` in the body (Google's documented invalid-key shape), or parse
`errorBody.error.details[].reason === 'API_KEY_INVALID'` from the JSON instead of substring-matching the
whole message. Treat a bare 403 `PERMISSION_DENIED` as a *retryable-with-alert* condition (log loudly, maybe
rest it briefly like a 429) rather than a permanent disable — an ops human, not the pool, should decide a key
is dead.

### Medium
**2. `embed-step.handler.ts` — a crash/abort between the Gemini call and the commit re-pays for that one batch.**
`run()` calls `this.gemini.embed(...)` (up to 20 `countTokens` + 1 `embedContent` calls) before the
`dataSource.transaction` that writes `embedding`/`token_count`. If the process dies or the step aborts between
the Gemini response and the `UPDATE`, the next attempt re-selects the same `embedding IS NULL` rows and pays
for the Gemini call again. Bounded to one batch (≤20 chunks), consistent with most of the stated design intent
("resumes where the last committed batch ended"), but the sentence undersells it slightly — it resumes at the
last batch *started*, not committed, when a batch is interrupted mid-flight. Worth a one-line comment so a
future reader isn't surprised debugging a duplicate-cost report.

**3. `gemini.client.ts:113-131` (`embed`) — a dimension/count mismatch drops the token-usage record for calls that already happened.**
`tokenCounts` are computed via real, billable `countTokens` calls before the `embedContent` response is
validated. If `vectors.length !== texts.length` or any vector's length is wrong, the method throws
`AiServiceUnavailableError` *before* reaching `this.record(...)`, so those `countTokens` calls (and the failed
`embedContent` call) never get a `usage_records` row. Low-frequency (only on a malformed Gemini response) but
breaks the doc comment's stated invariant "every call: ... → a usage_records row with real token counts."
Consider recording token usage in a `finally`/best-effort path regardless of the later dimension check.

**4. `pipeline-control.service.ts:47-51` — a `changed` reindex on a non-failed meeting resets every step, not just chunk/embed.**
```sql
UPDATE processing_jobs SET status='pending', ... WHERE meeting_id=$1 AND ($2::boolean = false OR status='failed')
```
When `resume` (i.e. `$2`) is `false` — the normal "ready + changed" path — the `WHERE` clause reduces to `true`,
so **all** steps go back to `pending`, not only the ones the phase-12 chunker actually rescoped. That's correct
today (chunk/embed genuinely reprocess only the touched range; there is nothing downstream yet to be wasteful
about — extract/relate/summarize don't exist until Phase 13-15), but it means the "re-processes only the
chunks containing it" acceptance criterion will stop being fully true once those steps land, unless they also
learn to scope themselves the way `rechunkWithinRanges` does. Flagging now so it's a conscious decision for
whoever builds Phase 13, not a surprise.

**5. `meeting-edits.ts` (`hasUnprocessedEdits`) only looks at `edited_at`; the chunker's "late upload" branch has no test proving it's reachable.**
`rechunkWithinRanges`'s fallback — "segments past the last range... chunked fresh" — exists for a genuinely new
segment landing after the last known chunk range, as opposed to an edit to existing text. But the gate that
decides whether a `changed` reindex is even allowed (`hasUnprocessedEdits`) only checks
`transcript_segments.edited_at > pipeline_started_at`; a plain new-row insert (not an edit) leaves `edited_at`
`NULL` and would not trip this check on an already-processed meeting. Per the Phase 04-05 clarifications,
segment ingestion is rejected outright (409 `INVALID_STATE_TRANSITION`) once a meeting reaches
`processing`/`ready`/`failed`, so it's plausible this branch is unreachable under the current state machine —
but nothing in `chunk-embed.integration.spec.ts` exercises "a new segment arrives past the last chunked range"
(only "an existing segment's text changes" is tested). Either add that regression test, or remove the branch
and its comment if it's confirmed dead code — as written it's an untested claim.

**6. `docs/api-spec.md` §6 is thinner than the real contract.**
It documents `GET /search` as `?q=&from=&to=&limit=` with no mention of `offset` and no response shape, while
`packages/shared/src/search/search.types.ts` (the actual source of truth per its own header comment) and
`SearchQueryDto`/`SearchResponseDto` fully specify both. Not a contract break — the shared package and the DTO
agree with each other — but the spec doc is now the odd one out for anyone reading `docs/` first per the
project's documentation-management rules. Recommend a short addendum to §6.

### Low
**7. `embed-step.handler.ts`/`gemini.client.ts` — up to 21 Gemini round-trips per 20-chunk batch (20× `countTokens` + 1× `embedContent`).** Explicit, deliberate trade-off per `clarifications.md` (`countTokens` is free and the only way to get a real count), already partly documented in the code comment — just flagging the cost/latency shape for anyone budgeting pipeline throughput at scale (500 meetings × ~15-40 chunks each).

**8. `use-scroll-to-initial-seq.ts:20-26` computes its target index against unfiltered `segments`, but `RealTranscriptScreen` renders `filteredSegments` in the `FlatList` (`real-transcript-screen.tsx:170`).** Harmless today (the in-transcript search box is empty on first mount, before the one-shot jump fires), but the two arrays could diverge if the effect ever fires after a query is already set. Pass `filteredSegments` in for defensive correctness.

**9. Nice regression guard worth keeping visible:** `vector-search.integration.spec.ts:114` asserts the query plan does **not** contain `idx_chunks_embedding` — this is what actually protects the "+0" planner-defeat trick from silently regressing to HNSW (and reintroducing the empty-page bug) on a future Postgres/pgvector upgrade. Good practice; don't let it get deleted as "flaky."

### Edge Cases Turned Up (scouting pass, beyond the diff)
- **Hash collisions across ranges:** `chunkContentHash(start, end, content)` folds in the seq range, so two
  different ranges can never collide even with identical content — verified by reading, no test needed to
  prove this algebraically, but `chunk-embed.integration.spec.ts`'s idempotency test indirectly confirms it.
- **Deleting chunks cited by mentions/relations/action_items:** `mentions.chunk_id` and `relations.chunk_id`
  are `ON DELETE CASCADE` (migrations `1758000000004`/`5`), `action_items.source_chunk_id` is `ON DELETE SET
  NULL` (migration `1758000000006`). A `changed` reconciliation that swaps a chunk's id therefore deletes its
  mentions/relations and nulls its action-item citation — but since `reindex('changed')` resets *every* step to
  pending (finding #4), the not-yet-built extract/relate steps will regenerate them from the new chunk on the
  same run. Correct today; re-verify once Phase 13-15 land in case they become incremental and stop reruning
  unconditionally.
- **Concurrent runs:** two `ChunkStepHandler.run()` executions for the same `meeting_id` in true parallel
  aren't explicitly guarded in this diff (no advisory lock around the delete/insert transaction). `reindex()`
  does lock the `meetings` row (`lockOwned`) for reindex-vs-reindex races, but I did not trace far enough into
  the Phase 11 BullMQ job/run-supersession logic to confirm an already-dequeued stale run can never race a
  fresh one at the chunk-step level. Flagged as unresolved rather than asserted as a bug — see below.
- **Empty transcript:** `DELETE FROM meeting_chunks WHERE meeting_id=$1 AND NOT (content_hash = ANY($2::text[]))`
  with an empty `$2` deletes all of that meeting's existing chunks — correct for a genuinely emptied transcript,
  and covered by the "no transcript → no chunks, no Gemini calls" test.
- **Offset abuse:** `offset` is capped at 200 by `SearchQueryDto`, `limit` at 50 — pagination depth is bounded
  by design, not by an unbounded client-supplied value.

### Done Well
- `content_hash` is computed from `trim()`ed content, so whitespace-only corrections don't trigger a pointless
  chunk swap and graph-citation cascade — a small but real resilience choice.
- `VectorRepository.searchChunks` keeps owner + soft-delete + date-range filters inside one parameterized
  statement; no join-then-filter, no string concatenation.
- Reconciliation is proved idempotent and scoped by tests, not just documented (`chunk-embed.integration.spec.ts`):
  a re-run changes nothing and calls Gemini zero more times; an edit to one segment only invalidates the chunks
  spanning that seq.
- `FakeGeminiServer` speaks Gemini's real REST shape over real HTTP (not a mocked class), including realistic
  429 `RetryInfo` bodies — key rotation and `cooldownFor` are proven against the actual request/response
  contract the SDK produces, not a hand-rolled string.
- L2-normalizing the (truncated 768-of-3072) Gemini embedding before storing/searching is correct and necessary
  for cosine distance to mean what the code assumes — easy to get wrong, wasn't.
- The migration is additive/nullable-first and the down-migration correctly discards embedding-less rows before
  restoring the old `NOT NULL` constraints — a genuinely reversible migration, not a one-way door.
- Dropping HNSW for exact per-user search is a sound, unusually well-argued call: real measurements at the
  actual target scale (7,500/50,000 chunks, both well under the 2s budget), a clearly stated failure mode for
  the alternative (HNSW's iterative scan returning incomplete pages under a selective per-user filter with dead
  tuples from reconciliation churn), and a regression test that would catch a silent reversion to HNSW.

### Actions In Order
1. Fix `isInvalidKey` (finding #1) — narrow to Google's actual invalid-key signal (400 + `API_KEY_INVALID`), stop auto-disabling on a bare 403.
2. Add a regression test for the "new segment past the last chunked range" path, or remove that branch if the state machine truly makes it unreachable (finding #5).
3. Record token usage even when the embed response fails validation (finding #3).
4. Note the full-pipeline-reset behavior of `changed` reindex as a conscious decision in the Phase 13 plan file (finding #4).
5. Update `docs/api-spec.md` §6 with `offset` and the response shape (finding #6).
6. Low-priority cleanups #2, #7, #8 whenever convenient.

### Numbers
- Backend unit: 294 passing (per task-supplied evidence, not independently re-run by me).
- Backend e2e: 87 passing; schema: 5 passing.
- Mobile: 797 passing.
- Lint/typecheck: clean (per task-supplied evidence).
- New Critical/High/Medium/Low from this review: 0 / 1 / 5 / 3.

### Still Unresolved
- Real Gemini behavior (countTokens support on `gemini-embedding-001`, real 429/403 body shape, actual
  embedding quality/relevance) is **unproven** — `GEMINI_API_KEY` is empty in this environment and
  `scripts/gemini-live-check.ts` has not been run against a live key. The `@google/genai` error-construction
  code path is confirmed by reading the installed package (supports finding #1 and the `cooldownFor` design),
  but no live call has exercised it.
- Concurrent-run safety at the chunk-step level (two `ChunkStepHandler.run()` calls racing for the same
  `meeting_id`) was not fully traced into the Phase 11 BullMQ job/run infrastructure; noted as an edge case, not
  asserted as a bug.

---

**Status:** DONE_WITH_CONCERNS
**Summary:** No critical/security/breaking-change defects; one High-severity availability bug in Gemini key-invalidation detection (false-positives on ordinary 403s, permanently disabling a key with no auto-recovery) should be fixed before ship. Chunk/embed reconciliation, search authz/SQL, and the HNSW-vs-exact-search call are all sound and well-tested. Several Medium documentation/test-coverage gaps noted for before Phase 13 builds on top of this.
**Concerns/Blockers:** Finding #1 (isInvalidKey false positives) is a real production-availability risk, not hypothetical — recommend fixing before merge. Real-Gemini behavior remains unverified pending a live API key.
**Score:** 7/10

---

## Addendum — Re-review 2026-09-26 (after fixes)

Re-inspected against the coordinator's changelog and `temper-results.json` (rebuilt from real exit codes:
8/8 pass — shared build, api `test:unit` 310, `test:e2e` 87, `test:schema` 5, mobile 797, both typechecks,
`eslint --max-warnings=0`).

1. **Finding #1 (High, isInvalidKey) — FIXED.** `apps/api/src/ai/gemini-call-runner.ts:13-18` now requires
   HTTP 400 + `/API_KEY_INVALID|API key not valid/` to disable a key; a bare 403 logs `"key kept"` and throws
   `AiServiceUnavailableError` without touching the pool. `gemini-call-runner.spec.ts:59-66` sends a realistic
   `403 PERMISSION_DENIED "Billing is disabled"` body on a single-key pool and proves the key still serves the
   next call. This closes the false-positive outage risk I traced through `@google/genai`'s real error
   construction at the prior pass. **Accepted, verified by reading the new code and its test.**
2. **Finding #3 (Medium, usage lost on a failed dimension check) — FIXED.**
   `apps/api/src/ai/gemini.client.ts:130-135` now calls `this.record(...)` immediately after the Gemini calls
   settle, before the vector-size check; `gemini.client.spec.ts` asserts the real token count lands even when
   that check subsequently fails. **Accepted.**
3. **Finding #5 (Medium, late-upload branch untested) — not changed, judgment requested.** I accept this as
   resolved: segment ingestion is rejected (409 `INVALID_STATE_TRANSITION`) once a meeting leaves
   recording/paused/ended/queued (a Phase 04 decision I re-confirmed doesn't change here), so the branch is
   genuinely unreachable via the integration path in production — it's defensive code, not a gap. It's now also
   unit-tested directly (`chunker.spec.ts:93-99`, "chunks segments that arrived after the last range"), which
   is the right level to test logic the state machine otherwise keeps out of reach. No further action needed.
4. **Finding #4 (Medium, `changed` reindex resets every step) — not changed, judgment requested.** I accept
   this as resolved for *this* phase: the concern was about wasted Gemini calls, and chunk/embed's own
   idempotency (`content_hash` reconciliation, `embedding IS NULL` resumption) means re-running unaffected
   chunks costs nothing regardless of `processing_jobs` status. The original note stands as a forward-looking
   design flag for whoever builds Phase 13-15 (their steps will need their own scoping to keep the "only the
   chunks containing it" property once they exist) — not a defect of this phase's own claims.
5. **Finding #6 (Medium, docs/api-spec.md §6 thin) — deferred to doc-writer, acknowledged, not blocking.**
6. **Flaky test fix — verified.** `pipeline-engine.integration.spec.ts:48-49` now backdates only its own
   meeting (`2000-01-01`) with a scoped cutoff (`2000-01-02`) instead of letting `resumeStalled` sweep the whole
   shared test DB; this correctly closes the cross-suite race that occasionally marked another suite's meeting
   `extract: succeeded`.
7. **Trimmed tests — verified.** `embed-handler-edge-cases.spec.ts` (non-UUID `meetingId` against an
   uninitialized `DataSource`, failing for the wrong reason) is gone; `gemini-key-pool-edge-cases.spec.ts` lost
   three vacuous cases; `chunker-edge-cases.spec.ts`'s overlap test now asserts unique content and strictly
   increasing chunk starts. Net effect is better signal, not less real coverage.

**Still unproven, honestly recorded:** `GEMINI_API_KEY` remains empty — `countTokens` support and real
error/quota body shape on `gemini-embedding-001` against the live API, and real semantic-search relevance, are
still not demonstrated. This is the only thing keeping the verdict off `SEALED`; per the evidence-validator
contract, a non-empty `unproven` array cannot seal regardless of `criticalCount`. This is not a code defect —
it needs an actual Gemini key run through `scripts/gemini-live-check.ts` (and ideally a small relevance
sanity-check against `perf:search`-scale data) to convert to proven.

**Status:** DONE_WITH_CONCERNS
**Summary:** All actionable findings from the first pass (1 High, 2 Medium) are fixed and verified in code and
tests; the 2 remaining Medium items are accepted design judgments with sound rationale, not defects; 1 Medium
(docs) is deferred to doc-writer. `criticalCount` is 0 and nothing is refuted. The only blocker to `SEALED` is
the honestly-recorded `unproven` set (live Gemini behavior), which cannot be resolved without real API access —
this is a `REWORK`-not-`SEALED` outcome by design, not a new problem found in this pass.
**Concerns/Blockers:** Gate cannot reach SEALED until `GEMINI_API_KEY` is set and `scripts/gemini-live-check.ts`
is run to convert the two unproven items to proven (or until the plan explicitly accepts shipping with that gap
recorded). No other blockers.
**Score:** 8/10
