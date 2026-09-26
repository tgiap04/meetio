# Review: Phase 16 — NFR hardening (privacy, cost, logging, observability, retention)

## Scope
- API: `users/consent.ts`, `users.service.ts`, `meetings.service.ts` (consent gate), `jobs/retention.job.ts` + processor/scheduler + `jobs.module.ts`, `notifications.module.ts` export, `meetings.module.ts` export, `common/logging/*` (json-logger, request-logging.interceptor), `configure-app.ts`, `main.ts`, `pipeline/pipeline-engine.ts`, `qa/qa.service.ts` (latency), migration `1758000000019`, entities (meeting/qa-message/user)
- Tests: `privacy.e2e.spec.ts`, `perf-budgets.e2e.spec.ts`, `json-logger.spec.ts`, `e2e-app.ts` consent seeding, `ws-test-client.ts` `ackedAt`
- `apps/api/scripts/ops-metrics.mjs`; `.env.example`
- `packages/shared`: `user.types`, `users.types`, `notifications.types`, `api-error-code`
- `docs/privacy-policy.md`, `docs/nfr-verification.md`
- Mobile: consent screen, home-screen gate, axios interceptor, privacy-policy screen + content + drift test, settings usage/retention/account/about sections
- Lines touched: ~34 modified files + ~20 new files (all new files are small: 11–160 lines; largest is `apps/mobile/src/content/privacy-policy.ts` at 160)
- Depth: full read of every touched/added file listed above, plus adjacent files needed to verify claims (segment-ingest handler, meeting-deletion service, usage-tracker, gemini client wiring, node_modules podspecs for NFR-13).

## Assessment
Solid, disciplined round. Consent v2 is enforced server-side at the one real chokepoint (`MeetingsService.create`), matches the clarification exactly (blocks both never-consented and stale-version users, mobile gate is graceful and has a global 403 interceptor as defense in depth), the retention job's time math and idempotent claim-then-push design are correct, and the JSON logger's allowlist genuinely stops content attached as a *field* from reaching the log — proven by both the unit test and the e2e log scan. `docs/nfr-verification.md` is largely honest, including admitting what's not yet measurable (NFR-02/05/08/13 partial). NFR-13 (iOS 16.4 floor from `expo-modules-core`) is independently confirmed against the installed package, not just asserted.

The one substantive gap: the allowlist is applied only to logging *structured objects*; the free-text `msg`/`stack` channel (used on every warn/error in `pipeline-engine.ts`, `pipeline-events.adapter.ts`, `retention.job.ts`) is never scrubbed, and there is a concrete, reachable path (`graph/extraction-schema.ts:85`, an AI-model-controlled `type` string) by which model-derived content can end up in that free-text message. `privacy.e2e.spec.ts` only exercises the success path, so this failure mode is untested and the "✅ Tự động" verdict on NFR-04 overstates what's actually proven.

## Critical
None.

## High
1. **Log content can still leak through the free-text `msg`/`stack` channel on an error path — untested, and reachable.**
   `apps/api/src/common/logging/json-logger.ts:54-58` allowlists fields only when the log call passes a **structured object**; when it's called with a string (or an `Error`), the entire string (or `error.message`) is written verbatim as `msg`, and `error()`'s second arg is written verbatim as `stack` — no filtering at all on that path.
   `apps/api/src/pipeline/pipeline-engine.ts:115` logs `` `Step "${data.step}" of ${state.meetingId} threw: ${error instanceof Error ? error.stack : String(error)}` `` on every step failure — the *entire* stack/message of whatever the step threw, unfiltered.
   There is a real, reachable source of model-derived content in that channel: `apps/api/src/graph/extraction-schema.ts:85` throws `` new ExtractionSchemaError(`loại thực thể lạ: ${type}`) `` where `type` is a field straight out of the Gemini extraction response — i.e., AI-generated (and transcript-derived) text. If the model ever emits a malformed/unexpected entity type value, that value is embedded in the error message, which then flows unfiltered through the pipeline-engine catch into the log as `msg`/`stack`.
   Same class of gap, lower risk, in `retention.job.ts:51,91` (`error.stack` on deletion/push failure) and `pipeline-events.adapter.ts:25,33` (`String(error)` on emit failure) — these carry only IDs today but are equally unscrubbed by construction.
   `privacy.e2e.spec.ts`'s log-scan test only drives the happy path (no step ever fails), so this gap is not exercised and NFR-04's "✅ Tự động, không tìm thấy chuỗi nào" is stronger than what's actually been proven.
   **Fix:** wrap the free-text branch in `json-logger.ts` to only ever accept a bounded, allowlisted **error code / class name**, not the raw message — e.g. `msg: message instanceof Error ? message.constructor.name : String(message).slice(0, 200)` for the automatic path, and require call sites that want detail to pass structured fields (`{ event, error_code }`) instead of a template string. At minimum, stop interpolating `error.stack`/`error.message` into pipeline-engine's warn calls — log `{ event: 'pipeline_step', step, outcome: 'failed', error_code: error.constructor.name }` instead (the JSON allowlist already has `outcome`/`error_code`-shaped fields available). Add a `privacy.e2e` case that forces a step to throw with a value containing the `SECRET_LINE` marker (e.g., feed extraction a shape that trips `extraction-schema.ts`) and assert the log still doesn't contain it.

2. **`docs/privacy-policy.md` §6 asserts TLS is in place; `docs/nfr-verification.md` (NFR-03) says it is not.**
   Policy text (also mirrored verbatim into the in-app screen, `apps/mobile/src/content/privacy-policy.ts:122`): "Mọi kết nối tới máy chủ dùng mã hóa TLS." (present tense, stated as fact to the end user). `docs/nfr-verification.md:14` (NFR-03 row): "TLS: chưa triển khai production" (not yet deployed to production). Publishing a privacy policy that tells users a protection is active when the project's own verification table says it isn't yet is a compliance-accuracy problem, not a wording nit — this is exactly the kind of claim item 5 of this review's mandate exists to catch. It doesn't block Phase 16's own work (TLS is an infra/deploy concern, correctly out of scope for the app/API code), but the policy text must not ship ahead of the infra it describes.
   **Fix:** either land TLS termination before shipping this policy version, or soften §6 to something conditionally true today (e.g., "kết nối tới máy chủ production được mã hóa TLS" only once actually true, or state it as a requirement/commitment rather than a completed fact until NFR-03 turns ✅).

## Medium
3. **Retention queries have no supporting index and will full-scan `meetings`/`users` as data grows.**
   `retention.job.ts`'s `apply()` and `announce()` both filter/order on a computed `COALESCE(m.ended_at, m.created_at) + make_interval(days => u.retention_days)` with no expression index, plus `m.status NOT IN (...)` with no partial index. Low risk today (hourly maintenance job, not user-facing latency), but worth a partial index (e.g., on `(status) WHERE deleted_at IS NULL`) before meeting volume grows past a small fixture size. Flag, don't block.

4. **Retention "announced" claim is unconditional even when the push itself fails.**
   `retention.job.ts:59-73` claims `retention_notified_at` via one atomic `UPDATE ... RETURNING` *before* attempting the push in `push()`; if `push()` throws (Expo down, bad token, etc.), the meeting is already marked notified and is never retried (comment at line 90 acknowledges this is deliberate: "not retried"). This is a reasonable trade-off given "one generic reminder, no retry" is the recorded design, but it means a user can have a meeting deleted 7+ days later having *never actually received* the one reminder they were promised, with no server-side signal that this happened (a `logger.error` line, easy to miss). Acceptable as shipped, but worth surfacing in `ops:metrics` or an alert rather than only a log line, given it silently defeats the entire point of the notice.

5. **Design doc says "log có cấu trúc bằng `pino`"; implementation is a hand-rolled `JsonLogger`.**
   `phase-16-nfr-hardening.md` line 28 names `pino` as the intended structured-logging library; the shipped code is a small custom `LoggerService` implementation with no new dependency. Functionally this meets every stated acceptance criterion and the allowlist design is arguably safer than a general-purpose logger's default behavior — but the plan file wasn't updated to reflect the deviation, and a future reader diffing plan vs. code will trip over this. Not asked for, not blocking; note only.

## Low
6. `apps/api/src/realtime/__tests__/ws-test-client.ts:13` uses a comma-operator expression (`(this.ackedAt.set(...), this.replies.push(...))`) inside the socket handler — works, but harder to scan than two statements in a block. Test-support code only.
7. `apps/api/scripts/ops-metrics.mjs:14,20` interpolates a CLI arg (`process.argv[2]`) straight into a raw SQL template string rather than binding it as a parameter. Not attacker-reachable (local ops script, developer-supplied arg, not an HTTP input), but it's the kind of pattern that's easy to copy-paste into somewhere that *is* reachable. Consider `$1::int` binding on principle.
8. `UsersService.sumCurrentMonthTokens` (`users.service.ts:168-174`) loads every usage row for the month into Node and sums in JS rather than `SUM()` in SQL. Fine at current volume (one row per AI call per user per month), but an obvious spot to push down to SQL if a user's monthly usage-record count grows.

## Edge Cases Turned Up
- **Consent bypass via segments/bulk or WS on an existing meeting: checked, not found.** Both `MeetingSegmentsController.bulk` and the realtime segment-ingest path only call `meetings.findOneOrFail`/`lockOwned` — no consent check — but this is correct by design: consent is the gate on *starting* a new recording (`POST /meetings`), and once a meeting exists, its segments/WS traffic belongs to a recording that already passed the gate. No route creates a new meeting or starts new AI processing without first passing through `MeetingsService.create`'s check. Confirmed no other `@Post` on `MeetingsController` creates a fresh recording.
- **Blocking existing (stale-consent) users: handled gracefully.** `apps/mobile/app/(app)/(tabs)/index.tsx` now gates the Start-recording button on `consent_required` (not the old `recording_consent_at` truthiness, which is exactly the bug that would have let v1-consented users slip through). The axios response interceptor additionally redirects to `/(app)/consent` on *any* 403 `CONSENT_REQUIRED`, server-wide — defense in depth against a stale client cache. `axios-client.test.ts` exercises this branch directly.
- **Retention window overlap:** the announce query's `(now, now+7d]` window and the delete query's `<= now` are mutually exclusive by construction, so a meeting can't be both announced and deleted in the same sweep, and a sweep gap (e.g. job down for a day) doesn't double-notify or skip deletion — confirmed by reading both `WHERE` clauses side by side, not just by the e2e test's single scenario.
- **Live meetings never touched:** both retention queries filter `m.status NOT IN ('recording', 'paused')`; `privacy.e2e.spec.ts`'s "Đang ghi" fixture confirms it survives a sweep.
- **`UsageTracker.assertWithinBudget`'s UTC month boundary and `UsersService.sumCurrentMonthTokens`'s JS-computed UTC month boundary are independently implemented but agree** (`date_trunc('month', now() AT TIME ZONE 'UTC')` vs. `Date.UTC(year, month, 1)`) — no drift between the enforcement path and the reporting path.
- **NFR-13 claim independently verified**: `node_modules/expo-modules-core/ExpoModulesCore.podspec` (installed version 57.0.18, matching `apps/mobile/package.json`'s `~57.0.23` line for `expo`) pins `:ios => '16.4'` — the doc's "không đạt iOS 15.x–16.3" claim is accurate, not guessed.
- **Shared-type/API-contract additivity**: `GetMeResponse` gained `usage` (kept `current_month_tokens_used`), `PublicUser` gained `consent_required`, `RecordConsentResponse` gained `consent_version` — all additive, no field removed or retyped; migration only adds nullable columns with no data loss on down-migration.

## Done Well
- Consent gate placement (`MeetingsService.create`, not a controller guard) means it can't be forgotten on a future route that also calls `create` — single chokepoint, not scattered checks.
- Retention job's failure isolation (`try/catch` per meeting inside the batch loop, `retention.job.ts:45-53`) means one bad deletion doesn't stall the whole sweep — correctly delegates to `MeetingDeletionService`'s existing graph-lock transaction rather than reimplementing deletion.
- `privacy-policy.test.ts`'s drift test compares flattened word sequences (not markdown structure), so it survives reformatting but still catches an added/removed/reworded sentence — a well-targeted anti-drift test, and it's the kind of test easy to get wrong (over-strict or too loose) but this one clearly wasn't.
- `nfr-verification.md` is refreshingly honest about what's *not* proven (NFR-02/05/08/13, legal fields blank) rather than papering over gaps — the review effort here mostly went into checking whether the ✅ rows were *actually* backed, and all but NFR-04 (see High #1) held up.
- Mobile's `consent_required` vs. `recording_consent_at` distinction is exactly the fix needed for the "existing consented users must re-consent" requirement — an easy bug to ship (checking staleness by presence rather than version) that wasn't shipped here.

## Actions In Order
1. Fix the free-text log leak channel (High #1) — scrub `error.message`/`error.stack` interpolation in `pipeline-engine.ts`, `retention.job.ts`, `pipeline-events.adapter.ts`; add an adversarial e2e case that forces a step failure with model-derived content and asserts it's absent from the log.
2. Resolve the TLS claim mismatch between `docs/privacy-policy.md` §6 and `docs/nfr-verification.md` NFR-03 (High #2) before this policy version is considered publishable — either land TLS termination or soften the claim.
3. (Optional, before scale) add a partial index backing the retention job's filters (Medium #3).
4. (Optional) surface silently-lost retention push failures somewhere more visible than a log line (Medium #4).
5. Update `phase-16-nfr-hardening.md` to say what was actually built (custom JSON logger, not pino) (Medium #5).

## Numbers
- Type coverage: typecheck clean (api + mobile), per `temper-results.json`.
- Test coverage: 8/8 gate commands pass — api unit 392, api e2e 136, schema 5, mobile 1086, both typechecks clean, eslint `--max-warnings=0` clean (`temper-results.json`, 2026-09-26T18:26Z).
- Lint findings: 0 (per temper-results.json's eslint run).
- New/changed files reviewed: 34 modified + ~24 added, all under the project's 200-line guidance (largest new file: 160 lines).

## Still Unresolved
- NFR-01: legal entity name/address/contact/server location left blank in `docs/privacy-policy.md` — explicitly flagged in the doc itself as needed before release; this needs real legal input, not code, so it's unproven rather than a defect.
- NFR-13: iOS 16.4 floor vs. Expo SDK 57 — the doc correctly identifies this as an open decision (raise iOS floor or downgrade Expo SDK), not yet made.
- NFR-02/05/08 (device-side speech recognition timing, translation) depend on Phase 00/07/09, correctly deferred — not this phase's scope.
- TLS-in-production (NFR-03) is an infra/deploy item outside this diff's code, but see High #2 for the accuracy problem it creates in the shipped policy text.

**Status:** DONE_WITH_CONCERNS

---

## Re-review (2026-09-27, second pass)

Both High findings from the first pass were addressed. Re-read every changed file below rather than trusting the summary.

### High 1 (free-text `msg`/`stack` leak channel) — verified fixed
- `apps/api/src/common/logging/log-error.ts` (new): `errorCode()` returns only the error's name/constructor name; `stackFrames()` keeps only lines matching `^\s+at\s` (drops the message line, which is always line 1 of `Error.stack`).
- `apps/api/src/common/logging/json-logger.ts:54,59`: the `error()`/`warn()` stack argument now always passes through `stackFrames()`; an `Error` passed as the message itself is rendered via `errorCode()`, not `.message`.
- Every call site that used to interpolate `error.message`/`error.stack`/`String(error)` into a template string was changed to stop doing so: `pipeline-engine.ts:115-118` (now `{event:'pipeline_step_error', meeting_id, step, error_code}` plus `logger.error(..., stackFrames(error))`), `pipeline-events.adapter.ts:26,34` (`errorCode(error)` instead of `String(error)`), `extract-step.handler.ts:85` and `summary-generator.ts:107` (dropped `${error.message}` entirely — id + reason only), `graph/extraction-schema.ts:85` (the model's `type` value is no longer embedded in the thrown message), `retention.job.ts` and `meeting-ready.notifier.ts:64` (`stackFrames(error)`), `api-exception.filter.ts:90,93` (`` `Unhandled ${errorCode(exception)}` `` + `stackFrames`, and the ownership-violation log now uses `request.route?.path` instead of `request.originalUrl` — closes a second leak path I hadn't flagged: a query string on a rejected request could have carried a search term).
- **This is a call-site-discipline fix, not a structural guarantee** — a future call site could still write `logger.warn(\`...${someContentVariable}\`)` and bypass the allowlist entirely, same as before. The team has correctly acknowledged this in the doc rather than overclaiming a mechanical guarantee (see nfr-verification.md row below) — that honesty is what makes this an acceptable resolution rather than a new overclaim.
- The adversarial e2e (`privacy.e2e.spec.ts:241-267`) is real, not staged: `e2e.gemini` is the actual `FakeGeminiServer` process the compiled server talks to over HTTP (confirmed by reading `test-support/e2e-app.ts` and `fake-gemini-server.ts`), so `e2e.gemini.failGenerate` genuinely makes the provider return an HTTP 400 whose message embeds `MARKER-provider-echo lương chị Hạnh`, and `e2e.gemini.generate` genuinely makes the model return an entity with `type: MARKER-model-value-bí-mật`. The test asserts `pipeline_step_error` appears in the log but none of the four marker/secret strings do. I did not independently re-run the "restoring the old line makes it fail" mutation claim, but the fix itself is correct on inspection: reverting `pipeline-engine.ts:115` to interpolate `error.stack` would reintroduce the exact string the test's markers are designed to catch (the provider-echo message would appear in the stack's first line before `stackFrames()` — except `stackFrames` would still strip it there; the real regression the mutation catches is reverting `logger.warn(...)` back to a *string* built from `error.stack` directly, i.e. bypassing `stackFrames`). Correct fix, correctly targeted test.
- `json-logger.spec.ts:25-38` (two new cases) directly cover an `Error` whose message carries content passed both as the second arg to `.error()` and as the message itself to `.warn()` — both come back clean.
- `docs/nfr-verification.md` NFR-04 row now states exactly what's proven: allowlisted structured fields, error name + stack frames only, "câu log là chữ do code viết, được test quét nhưng không bị lọc cơ học" (log lines are code-written text, scanned by test, not mechanically filtered) — this is the accurate claim; the prior "✅ Tự động" without that qualifier was the overclaim I flagged, and it's gone.

### High 2 (TLS claim) — verified fixed
`docs/privacy-policy.md` now carries a second pre-release callout: "Điều kiện phát hành: mục 6 khẳng định mọi kết nối dùng TLS — chỉ công bố bản này khi máy chủ production đã chỉ nhận HTTPS và app trỏ tới địa chỉ `https://` (NFR-03, chưa triển khai tại thời điểm viết)." This makes the TLS claim in §6 conditional on a release gate rather than a silently false present-tense statement. `docs/nfr-verification.md`'s NFR-03 row cross-links it ("cũng là điều kiện công bố chính sách quyền riêng tư (mục 6)"). The in-app §6 body text is unchanged (still says TLS is active) — correct, since `apps/mobile/src/content/privacy-policy.test.ts`'s drift test already strips every line starting with `>` (both callouts), so the app copy doesn't need to change and the callout doesn't leak into the shipped UI. Confirmed by reading the test's `stripMarkdownChrome`, not just trusting the description.

### Tester-flagged test-quality fixes — verified
- `retention.job.ts`'s "continues sweep if a deletion fails" case (`privacy.e2e.spec.ts:186-206`) now uses a real Postgres `BEFORE DELETE` trigger (`e2e_block_meeting_delete`) that raises on one specific meeting id; asserts the other two are gone and the blocked one survives for the next sweep. This is a genuine fault injection, not a mock — confirmed by reading the raw SQL.
- The no-push-token case (`privacy.e2e.spec.ts:208-219`) now queries `WHERE id = ANY($1::uuid[])` scoped to its own two meeting ids rather than asserting on `push.received` globally — correct fix for a global-sweep test running alongside other tests' fixtures in the same DB.
- `request-logging.interceptor.spec.ts` (new) has no `any` casts (checked directly) and adds a `\r\n`-header-injection case to the `x-request-id` rejection table — the existing `REQUEST_ID` regex anchors `^...$` so CRLF injection was already rejected, but now it's proven rather than assumed.

### Findings carried forward (unchanged, still Medium/Low, correctly deferred per the coordinator's message)
- Retention query index (Medium) — deferred, low risk at current scale.
- Retention notice claimed-before-push (Medium) — deferred, documented trade-off.
- `ops-metrics.mjs` CLI-arg SQL interpolation (Low) — deferred, not attacker-reachable.

### Re-verified unproven/external items (unchanged)
- NFR-01 legal entity/address/contact/server-location fields — still blank, needs real legal input.
- NFR-13 iOS 16.4 floor vs. Expo SDK 57 — still an open product decision.
- TLS deployment itself (NFR-03) — still not done; now correctly gates the policy's publish, rather than being silently contradicted by it.
- NFR-02/05/08 device-side timing/translation — correctly deferred to Phase 00/07/09.

### Updated Status
Both High findings are resolved with real fixes and real (not staged) adversarial tests. No new Critical or High findings on this pass. The evidence gate (`--stage hard`) still exits BLOCKED, but only on the `unproven` array — there are zero refuted claims, zero reachable regressions, zero open critical/high code findings. The remaining unproven items are exactly the four the coordinator called out as external: NFR-01 legal fields, TLS deployment (NFR-03, now correctly gated rather than misrepresented), the NFR-13 iOS-floor product decision, and Phase 00/07/09 dependencies. None are fixable by more code review or more code in this session — they need a lawyer, an ops deploy, and a product call, respectively. Remaining Medium/Low findings are unchanged deferrals the coordinator already asked about and explicitly chose not to fix now.

**Status:** DONE_WITH_CONCERNS
