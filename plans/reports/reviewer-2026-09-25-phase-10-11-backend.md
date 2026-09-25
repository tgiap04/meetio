# Review: Phase 10 + 11 Backend (apps/api, packages/shared)

Adversarial review of the uncommitted pipeline/AI-infra/export/transcript/notifications backend.
Mobile half excluded per instructions (still in progress elsewhere).

## Scope
- Files reviewed: `apps/api/src/pipeline/**`, `apps/api/src/transcript/**`, `apps/api/src/export/**`,
  `apps/api/src/notifications/**`, `apps/api/src/ai/**`, migration
  `1758000000014-AddPipelineRunsEditsAndPushTokens.ts`, entities (`meeting.entity.ts`,
  `transcript-segment.entity.ts`, `push-token.entity.ts`), `apps/api/src/jobs/*` diffs,
  `apps/api/src/meetings/{meetings.service,meeting-query.service,meeting-pipeline.trigger,
  meeting-edits}.ts`, `apps/api/src/app.module.ts`, `packages/shared/src/**` diffs.
- Lines: ~2,500 in new pipeline/transcript/export/notifications/ai modules (all files < 200 lines,
  per the file-size rule) + ~230 lines of diff to existing Phase 04 files.
- Depth: full read of every new/changed file, cross-checked against `clarifications.md`
  (sessions 2026-09-25, Phase 04-05 and Phase 07-08→10-11) and phase-10/phase-11 plan files.
- Verified independently (not taken on faith): `yarn workspace @meetio/api typecheck` (clean),
  `yarn eslint` on all touched dirs with `--max-warnings=0` (clean), full
  `yarn workspace @meetio/api test` against the real Postgres/Redis containers — **261 unit + 66
  e2e = 327 tests, all green**, and traced the exact BullMQ 6.3.6 source
  (`node_modules/bullmq/dist/cjs/classes/job.js`) to confirm the final-attempt arithmetic.

## Assessment
This is a careful, well-documented piece of infrastructure — the kind of code that reads like the
author already anticipated a reviewer's questions (comments explain *why*, not what). The
run-guarded row-lock pattern in `PipelineStore` is the right shape for "Redis is disposable,
Postgres is truth," and it is applied consistently. The one gap worth taking seriously before this
goes near real AI traffic is that a step's timeout/abort does not actually stop the in-flight work
in `GeminiClient`, which future step handlers (Phase 12+) will inherit; everything else is warning-
or suggestion-grade.

## Critical
None found.

## High
1. **`GeminiClient.withSlot` ignores the step's `AbortSignal` — a timed-out step keeps burning
   quota/API cost after the pipeline has already failed it.**
   `apps/api/src/ai/gemini.client.ts:105-116`. The semaphore wait (`new Promise<void>((resolve) =>
   this.waiting.push(resolve))`) has no listener on `request.signal`. `PipelineEngine.withTimeout`
   (`apps/api/src/pipeline/pipeline-engine.ts:123-137`) races `work()` against a timer and, on
   timeout, aborts the controller and rejects — but does **not** await or cancel `work()`. If a
   step is queued behind `maxConcurrency` (default 4) when its 10-minute budget expires, the
   engine already marks it failed/retrying (`store.failStep`/`recordAttemptError`) and requeues a
   new attempt, while the original call still sits in `waiting[]`. When a slot eventually frees, it
   fires, calls Gemini, and unconditionally calls `usage.record(...)` — a real cost with no
   accounting benefit and, worse, a second concurrent attempt at the same step can now be
   in-flight together with this ghost one once Phase 12+ handlers add DB writes after the Gemini
   call (chunk/summary rows). This is exactly the "abort doesn't truly cancel work" class of bug
   the review brief called out.
   Fix: give `withSlot`/`withRetries` a fast rejection path — `if (request.signal?.aborted) throw` at
   entry to `withSlot`, and reject the queued waiter immediately via
   `request.signal?.addEventListener('abort', () => { removeFromQueue(); reject(...) })`. Also
   have `models.generateContent`'s abort listener path skip `usage.record` when the call itself was
   aborted before starting (it currently only guards the retry loop's `attempt >= retries`, not the
   pre-flight queue wait).

2. **`Worker` concurrency is left at BullMQ's default of 1 per queue, making `GeminiClient`'s
   `maxConcurrency: 4` dead configuration and creating a real throughput ceiling.**
   `apps/api/src/pipeline/pipeline-options.ts` and `processors/step-processors.ts` never set
   `concurrency` on `@Processor(name, options)`. With one worker instance per queue processing one
   job at a time, all meetings server-wide share a single in-flight `chunk` job, a single
   `embed` job, etc. — regardless of how many are queued. `GeminiClient`'s own bounded parallelism
   (4) can never be exercised because only one step job (hence at most one Gemini call from that
   queue) is active at any time. Given the phase-11 NFR ("pipeline cuộc họp 60 phút xong trong 5
   phút" under presumably concurrent meetings), this is a scalability finding, not just a nit:
   throughput for N simultaneous meetings degrades linearly with N on every step queue.
   Fix: set an explicit `concurrency` in `stepWorkerOptions` (e.g. matching or below
   `GEMINI_MAX_CONCURRENCY`) so `@Processor(stepQueueName(step), { ...stepWorkerOptions,
   concurrency: N })` actually parallelizes, and document the intended per-step concurrency in the
   same file that already centralizes the retry/timeout knobs.

## Medium
1. **Raw exception messages are persisted to `processing_jobs.error_message` and returned verbatim
   by `GET /meetings/:id/status`.**
   `apps/api/src/pipeline/pipeline-engine.ts:96` (`const message = error instanceof Error ?
   error.message : String(error)`) flows straight into `PipelineStore.failStep`/
   `recordAttemptError`, and `PipelineControlService.status()`
   (`apps/api/src/pipeline/pipeline-control.service.ts:78-85`) hands it to the client unfiltered via
   `MeetingStepStatusDto.error_message`. No handler exists yet (Phase 12+ will add them), so this is
   latent rather than exploitable today, but the contract being established here — "whatever a step
   handler throws becomes a string an external API client reads" — is the wrong default for
   NFR-04's spirit (no internal detail reaching outside the backend) and for check #8 in general: a
   future Postgres constraint violation, a raw Gemini SDK error with an internal URL, or a Node
   error with a file path could all surface to the mobile app. `NonRetryableStepError`/
   `AiServiceUnavailableError` messages are already hand-written and safe, but nothing stops a
   handler from letting an unrelated exception (`TypeError`, `pg` driver error, etc.) propagate
   unchanged.
   Fix: whitelist which error types may pass their `.message` through to `error_message` (the two
   AI-error classes and any handler-declared "user-facing" error), and fall back to a generic
   string ("Lỗi nội bộ, đang thử lại") for anything else, logging the real message server-side only.

2. **BullMQ's own stalled-job recovery is not reconciled with `processing_jobs` state, so a step
   stuck at `status='running'` after a real worker crash relies entirely on the 15-minute
   maintenance sweep (with a 10-minute stall threshold) to heal — a ~15-25 minute window where the
   meeting shows "processing" with no forward motion and no user-visible signal that anything is
   wrong.** `apps/api/src/jobs/meeting-maintenance.processor.ts:13` (`STALLED_AFTER_MS = 10 *
   60_000`) equals `DEFAULT_STEP_TIMEOUT_MS` exactly, and the scheduler only runs every 15 minutes
   (`meeting-maintenance.scheduler.ts:11`). Worst case: a step times out at minute 10, the sweep
   just missed its 15-minute tick, so the next sweep is up to 15 minutes later, i.e. the meeting can
   sit un-advanced for up to 25 minutes. This is within the letter of the phase-11 acceptance
   criteria (nothing promises a specific recovery SLA) but works against the "60 minutes → 5
   minutes" performance NFR on the unlucky path, and is worth a deliberate choice rather than an
   accidental one — e.g. shrinking the sweep interval or making `STALLED_AFTER_MS` a fraction of the
   step timeout instead of equal to it.

3. **Duplicate/zombie job execution is bookkeeping-safe but not execution-safe.**
   `PipelineStore.markRunning` (`pipeline-store.ts:88-97`) only checks `status <> 'succeeded'`
   before bumping `attempts` and resetting `started_at`; it does not fence against a second,
   concurrently-running worker for the *same* step (e.g. a BullMQ lock-renewal miss under GC
   pressure, causing BullMQ to hand the job to a new worker while the old one is still executing
   `handler.run()`). Today this is inert because no handlers exist; once Phase 12+ handlers do
   real I/O with side effects (writing chunks, calling Gemini), two workers racing the same step
   could both write. BullMQ's own stalled-job protection (`maxStalledCount`, lock renewal) reduces
   the odds but does not eliminate them, especially for long-running (up to 10-minute) steps.
   Not asking for a rewrite now — flagging it so whoever implements Phase 12 handlers designs their
   writes to be idempotent/upsert-based rather than append-based, since this layer will not stop a
   duplicate run.

4. **`ExpoPushClient.send` treats a non-2xx HTTP response as a per-message error but does not
   distinguish rate-limiting (429) from a hard failure**, and callers (`MeetingReadyNotifier`)
   only special-case `DeviceNotRegistered` tickets. An Expo 429 would silently be swallowed as a
   generic push failure with no retry — the "exactly once" push (US-30) is then permanently lost
   for that meeting, since `ready_notified_at` is already claimed before the send happens
   (`meeting-ready.notifier.ts:29-39`). This trades "never double-notify" for "sometimes
   never-notify" on transient Expo throttling, which is a defensible choice but should be a
   documented one (e.g. a comment noting the trade-off, or a dead-letter/retry path) rather than an
   implicit side-effect of claim-then-send ordering.

## Low
1. `PipelineEngine.resumeStalled` iterates and calls `advance()` sequentially
   (`pipeline-engine.ts:115-121`) rather than in parallel — fine at current expected volume (500-row
   `LIMIT`), but will slow the sweep linearly as the stalled-meeting count grows; note for later,
   not a fix-now item.
2. `exportFileStem` (`export.service.ts:33-43`) silently falls back to `'bien-ban'` when a title has
   no ASCII-mappable characters (e.g. a title in Japanese or emoji-only); acceptable, but worth a
   one-line comment so it doesn't look like dead code to the next reader.
3. `retryDelayMs`'s exponent base (`4 ** (attemptsMade - 1)`) produces exactly 2s/8s/32s only
   because `DEFAULT_RETRY_BASE_MS = 2000`; the function name doesn't hint at the `4×` growth factor,
   which is easy to get wrong if someone changes `DEFAULT_RETRY_BASE_MS` expecting linear/backoff-
   doubling semantics. A short comment on the constant (`4^n growth, not 2^n`) would save the next
   reader a trace through `node_modules/bullmq`.
4. `MeetingsService.update()` does an extra `findOneOrFail` read purely to resolve the default
   title when the title is blanked (`meetings.service.ts` diff), outside the transaction that
   performs the actual patch. Harmless (the default only depends on immutable `started_at`), but
   two round-trips where one (inside the existing `changeStateReturningRun`-style lock) would do.

## Edge Cases Turned Up (scouting pass, before reading the diff)
- **Meeting deleted mid-run**: `PipelineStore.lock`/`current` filter `deleted_at IS NULL`, so any
  in-flight step's next store write (`markRunning`, `markSucceeded`, `failStep`,
  `recordAttemptError`) silently returns `false` once the meeting is gone — the error still
  propagates to BullMQ for retry bookkeeping, but no further writes happen. Correctly handled;
  hard-delete's FK cascade (Phase 04, unchanged here) will contend for the same row lock
  (`FOR NO KEY UPDATE`) but not deadlock (single-row, same lock order). No bug found here — noting
  it as verified, since it was an explicit focus item.
- **Reindex `changed` from `ready` vs `failed`**: traced the SQL in `PipelineControlService.reindex`
  (`pipeline-control.service.ts:47-51`) character by character — `resume` is only true for
  `scope==='changed' && status===FAILED`; in that branch only `status='failed'` rows reset to
  pending (skip-succeeded semantics), and `pipeline_changed_since` is deliberately left untouched.
  In every other branch (`full`, or `changed` from `ready`) **all** steps reset to pending
  regardless of prior status — correct, because a "changed" run still walks every step, with each
  step's handler expected to scope its own work using `context.changedSince`/`context.scope`
  (chunk/embed/extract/resolve run narrow, summarize sees everything, per the phase-10 "Nhận định
  then chốt"). This matches clarifications exactly; verified against the literal SQL rather than
  the comment.
- **`nextStep()` is not run-scoped** (`processing_jobs` has no `run` column) — by design, since a
  `succeeded` step from run N should stay skipped when run N+1 starts (resume/changed semantics).
  Confirmed this is intentional, not an oversight, by reading `startRun`'s `ON CONFLICT DO NOTHING`
  insert and the reindex UPDATE together.
- **Final-attempt detection vs BullMQ 6.3.6**: read `job.js` directly — `attemptsMade` is the count
  of *prior* attempts when `process()` is invoked (incremented only inside `moveToFailed`/
  `moveToCompleted`, after the handler returns). `handleStepJob`'s `attemptsMade + 1 >= maxAttempts`
  is therefore the exact mirror of BullMQ's own `shouldRetryJob`'s
  `attemptsMade + 1 < opts.attempts`. This was a specific focus item and it is correct.
- **Push token moving between accounts**: registering the same Expo token under a new user
  (`push-tokens.controller.ts:24-28`, `ON CONFLICT (token) DO UPDATE SET user_id = EXCLUDED...`)
  correctly re-homes the device and stops the old account's notifications — matches the explicit
  clarification and is the right call for a shared-device logout/login flow. `unregister` is scoped
  by `token AND user_id`, so one account cannot silence another's device.
- **SQL injection**: every new raw query uses `$n` placeholders; the one hand-built pattern
  (`unaccent(lower(m.title)) LIKE '%' || unaccent(lower(:q)) || '%'`, pre-existing in
  `meetings.repository.ts`, touched only incidentally) already escapes `%`/`_`/`\` in the input.
  Nothing new in this diff builds SQL by concatenation.
- **Export escaping**: manually traced both `renderMarkdown`'s two-pass escape (inline markers
  everywhere, block markers only at line start) and `renderHtml`'s `&<>"'` entity map against
  segments containing `#`, `*`, `<script>`, and a leading `- ` — both neutralize correctly.
  `Content-Disposition` filename is derived from `exportFileStem`, which can only contain
  `[a-z0-9-]`, so header injection via a crafted title is not reachable.

## Done Well
- `PipelineStore`'s comment at the top of the file states the invariant ("processing_jobs +
  the meeting row are the source of truth; Redis only carries work... every write re-checks, under
  the meeting's row lock, that the job belongs to the current run") and every method actually
  upholds it — `stepWrite`'s combined `pipeline_run` + `status===PROCESSING` guard is exactly the
  stale-run/deleted-meeting protection the phase needed, and it's applied uniformly rather than
  ad hoc per call site.
- The five-queue-per-step design plus per-run job ids (`<meeting>-r<run>-<step>`) genuinely solves
  the "retry vs. dedupe" tension BullMQ's `jobId` dedup would otherwise create — confirmed this
  against `bull-step-queue.ts` and `pipeline-steps.ts` together.
  matches the "no fake ready" clarification precisely and is covered by a dedicated e2e test.
- `MeetingReadyNotifier`'s exactly-once claim (`ready_notified_at IS NULL` in the `UPDATE ...
  RETURNING`) is a clean, race-free pattern, and the generic push copy is a good-faith NFR-01
  implementation, not just an afterthought comment.
- Export escaping and Content-Disposition handling are both correct on inspection, not just by
  test — a rare case of a review finding nothing to add.
- Authorization is consistent and boring in the best sense: every new read/write joins or filters
  by `user_id` inside the same query, not as a separate "check then trust" step, across
  `TranscriptService`, `ExportService`, `PipelineControlService`, and `PushTokensController`.

## Actions In Order
1. Fix `GeminiClient.withSlot`/`withRetries` to honor `AbortSignal` (High #1) before any Phase 12+
   handler starts relying on this client for real traffic — this is the one item with real cost/
   correctness exposure once handlers exist.
2. Decide and set an explicit BullMQ `Worker` `concurrency` per step queue (High #2) — otherwise
   `GEMINI_MAX_CONCURRENCY` is a config knob that does nothing.
3. Whitelist which errors' `.message` reach `processing_jobs.error_message` / the `status` API
   (Medium #1).
4. Revisit the stall-sweep timing relationship (`STALLED_AFTER_MS` vs. sweep interval vs. step
   timeout) as a deliberate choice (Medium #2).
5. Note the duplicate-execution risk in Phase 12's handler-writing guidance so handlers are written
   idempotently from the start (Medium #3).
6. Decide Expo 429 handling consciously (Medium #4) — retry, dead-letter, or explicitly accept the
   "may miss a notification under throttling" trade-off in writing.

## Numbers
- Type coverage: `tsc --noEmit` clean, 0 errors.
- Test coverage: 261 unit + 66 e2e = 327/327 passing (verified by running, not by trusting the
  hand-off summary); pipeline integration tests run against real Postgres + Redis + BullMQ, not
  mocks.
- Lint findings: 0 (`eslint --max-warnings=0` across every touched directory).
- File-size discipline: all 33 new/changed files under 200 lines (largest is `pipeline-store.ts`
  at 175).

## Still Unresolved
- OQ-04 (per-user Gemini token budget default) is explicitly left open in code
  (`usage-tracker.ts:30-31`) and in the plan's risk table — correctly deferred, not a defect, but
  flagging so it isn't lost before Phase 12+ starts spending tokens for real.
- Mobile half of Phase 10/11 not reviewed here per instructions — the `has_unprocessed_edits`
  contract, push-token registration flow, and export share-sheet integration on the client side
  still need a pass once that lands.

**Status:** DONE
**Summary:** Backend is solid — typecheck/lint/327 tests all genuinely pass, authz and SQL are
clean everywhere touched, reindex/resume/export/push semantics match `clarifications.md` exactly on
line-by-line inspection. No criticals. Two High findings (Gemini abort not honored by the
concurrency semaphore; Worker concurrency left at BullMQ's default of 1, making the client's own
concurrency limit unreachable) should be fixed before Phase 12+ handlers start making real Gemini
calls through this infra. Four Medium findings are process/design trade-offs worth a deliberate
decision rather than a blocker.
**Concerns/Blockers:** None blocking — the two High items affect cost/throughput once AI step
handlers exist (Phase 12+), not correctness of Phase 10/11 as delivered. Recommend fixing High #1
before Phase 12 lands its first real Gemini call.
**Score:** 8/10

---

## Follow-up (2026-09-25): fix verification

Verified every claimed fix directly in code, then re-ran the full gate — not just the diff, the
actual behavior each fix is supposed to produce.

1. **High 1 (Gemini abort)** — `apps/api/src/ai/gemini.client.ts:105-140`. `withSlot` now takes
   `signal` explicitly: rejects immediately if already aborted before queueing
   (`if (signal?.aborted) throw ...` at entry — this is the pre-aborted-hang case the new test
   catches), and a queued waiter registers its own `'abort'` listener that removes itself from
   `waiting[]` and rejects, rather than sitting forever. Traced the hand-off logic in the
   "didn't-wait" branch's redundant-looking `this.waiting.shift()?.()` on a late-arriving abort —
   confirmed it's a correct slot hand-off to the next real queued waiter, not a concurrency-limit
   leak (the invariant "waiting is only non-empty when active >= max" holds because the check-then-
   act in the no-wait branch is synchronous, no `await` in between). **Fixed, verified correct.**
2. **High 2 (Worker concurrency)** — `apps/api/src/pipeline/pipeline-options.ts:17-22` adds
   `STEP_CONCURRENCY` (env `PIPELINE_STEP_CONCURRENCY`, default 4) into `stepWorkerOptions`, and
   `processors/run.processor.ts:8` applies the same constant to the run queue's `@Processor`. All
   five step processors already consumed `stepWorkerOptions`
   (`processors/step-processors.ts:19-51`), so this one change reaches every queue. **Fixed,
   verified.**
3. **Medium: raw error messages** — `apps/api/src/pipeline/pipeline-step-handler.ts` adds
   `ExplainedStepError` (parent of `NonRetryableStepError`); `pipeline-engine.ts:36-46` defines
   `isSafeToShow`/`investigationMessage`, keeping the raw message only for `ExplainedStepError` or
   the file-local `StepTimeoutError`, and substituting `"Lỗi hệ thống ở bước <step> (<ErrorName>)"`
   for anything else — the real message and stack go to `logger.warn` (server-side only), never to
   `processing_jobs.error_message`. Checked `ai-errors.ts`: `QuotaExceededError extends
   NonRetryableStepError extends ExplainedStepError` and `AiServiceUnavailableError extends
   ExplainedStepError` directly — both of the two hand-written, safe-to-show error types the
   original finding named are covered. **Fixed, verified correct and matches the finding's own
   suggested fix shape almost exactly.**
4. **Medium: stall latency** — `meeting-maintenance.processor.ts:13`
   (`STALLED_AFTER_MS = 5 * 60_000`) and `meeting-maintenance.scheduler.ts:11-26` (resume sweep now
   `EVERY_5_MINUTES`, the other two sweeps unchanged at 15). Worst case is now ~10 minutes
   (5-minute threshold + up to one 5-minute tick), down from ~25. **Fixed.**
5. **Medium: Expo throttling** — `expo-push.client.ts:57-77`'s new `post()` retries up to 3 times
   (1s, 4s apart, `retryBaseMs * 4 ** (attempt-1)`) on network errors and any response that is
   neither `ok` nor a genuine client error (`last.status < 500 && last.status !== 429` is the only
   early-return-without-retry condition, so 429 and 5xx both retry, everything else returns
   immediately) — correctly narrows the retry set to exactly what the finding asked for. **Fixed.**
6. **markRunning zombie fencing** — left as a Phase 12 handler-design note rather than fixed here.
   Agreed: this was flagged as a residual risk for *future* handler code to design around
   (idempotent writes), not a Phase 11 defect — there is nothing to fence yet since no handler
   exists. No disagreement with deferring it.

Re-ran the full verification chain myself rather than trusting the hand-off numbers:
`yarn workspace @meetio/api typecheck` clean, `eslint --max-warnings=0` clean across every touched
directory, and the full suite live against the real Postgres/Redis containers: **267 unit + 66 e2e
= 333/333 passing** (267, not 261 — the two new test files for the Gemini-abort and error-
sanitization fixes account for the difference).

**Updated Status:** DONE — all six items addressed (five fixed and verified in code, one
deliberately deferred with a stated, agreed-with rationale). No new findings from re-reading the
changed files. Backend is clear for Phase 12+ to build real step handlers on top of.
**Updated Score:** 9/10.
