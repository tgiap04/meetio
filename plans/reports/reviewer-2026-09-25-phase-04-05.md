# Review: Phase 04 (meeting lifecycle REST) + Phase 05 (realtime transcript gateway)

## Scope
- Files reviewed (uncommitted, `git status`/`git diff`): all of `apps/api/src/meetings/`, `apps/api/src/segments/`, `apps/api/src/realtime/`, `apps/api/src/jobs/abandoned-meeting.job.ts` + `meeting-maintenance.{processor,scheduler}.ts`, migration `1758000000012-AddRecordingSettingsAndPauseTracking.ts`, `meeting.entity.ts`, `auth/jwt-auth.guard.ts`, `auth/auth.module.ts`, `main.ts`/`configure-app.ts`, `jobs.module.ts`, `app.module.ts`, `package.json`, `packages/shared/src/{enums,meetings,websocket}`.
- Lines: ~2125 across the new/changed `apps/api/src` files (all individually <200 lines, per guidance).
- Depth: full read of every file above, plus the referenced pre-existing files it depends on (`ScopedRepository`, `ApiExceptionFilter`, migration `1758000000003`, `jwt.strategy.ts`, `jwt-auth.guard.ts`).

## Assessment
Solid, deliberate engineering. The durable-before-ack path (`SegmentIngestHandler` → `SegmentBatchWriter` → `SegmentUpsertRepository`) is correct: `write()` only resolves after the batch's transaction commits or rejects, a batch failure rejects every item in it (no partial-ack), and the fault-injection e2e test (`meeting-gateway.e2e.spec.ts:103-126`, a real Postgres `BEFORE INSERT` trigger) actually proves "never an ack, never a row." `end()`'s missing-seq check runs inside the same transaction that flips status, gated by the same `FOR NO KEY UPDATE` row lock every writer takes, so there is no window where `end` commits while a segment insert that should have blocked it is silently lost — the two orderings I traced both resolve correctly (either the segment lands and is counted, or `end` reports it missing and the caller retries). Authorization is consistently scoped through `MeetingsRepository`/`ScopedRepository`, `ParseMeetingIdPipe` maps bad ids to the same 404 as someone else's meeting, and the WS handshake+join ownership check is real (`ws-auth.middleware.ts` + `MeetingGateway.join`). NFR-04 holds — grepped every `logger.*` call in the changed tree, none logs segment text. SQL is parameterized throughout; the one raw `generate_series`/LIKE query builder is on the read side with proper escaping.

Two things below are worth fixing before this ships to real users; nothing here is a data-loss or auth-bypass hole.

## Critical
None found.

## High
1. **Raw exception leaks to the client on `POST /meetings/:id/segments/bulk`.** `apps/api/src/meetings/meeting-segments.controller.ts:46-61` — `toHttpError()` returns the *original* error unchanged whenever it isn't a `SegmentRejectedError`, and the controller `throw`s it. Any unexpected failure in `SegmentUpsertRepository.upsertMany` (DB connection drop, constraint violation, disk full) reaches `ApiExceptionFilter`, which — for a non-`HttpException` — replies with `exception.message` and a bare 500 (`apps/api/src/common/filters/api-exception.filter.ts:65-67`). That is exactly the "internal stack trace/error text reaching an external consumer" pattern (checklist #8). It is also inconsistent with the sibling WS path: `SegmentIngestHandler.handle()` (`realtime/segment-ingest.handler.ts:74-84`) does this correctly — catches, logs safely (seq + length, never text), and returns a generic `INTERNAL_ERROR` message.
   **Fix:** mirror the WS handler in `toHttpError`/`bulk()` — catch the non-`SegmentRejectedError` case, log it with `Logger`, and throw a plain `InternalServerErrorException({ code: ApiErrorCode.INTERNAL_ERROR, message: 'Không ghi được đoạn transcript — giữ lại và gửi lại sau', details: {} })` instead of rethrowing.

## Medium
2. **`findMissingSeqs` can be forced into a large scan while holding the meetings row lock.** `apps/api/src/segments/segment-upsert.repository.ts:76-87` runs `generate_series(1, $2::int)` anti-joined against `transcript_segments`, and it executes inside `MeetingsService.end()`'s transaction (`meetings.service.ts:71-90`) — which is already holding `FOR NO KEY UPDATE` on the meetings row (acquired by `lockOwned`). `EndMeetingDto.last_seq` is caller-controlled up to `1_000_000` (`meetings/dto/end-meeting.dto.ts:13`). A client (or an attacker who knows a meeting id it owns) can call `end` with `last_seq: 1000000` on a meeting that has 3 real segments, forcing a ~1M-row `generate_series` scan on every call while the row lock blocks every other status change and every segment write for that meeting.
   **Fix:** before running `generate_series`, cheaply cap the range to the real high-water mark, e.g. `LEAST($2, (SELECT COALESCE(MAX(seq),0) FROM transcript_segments WHERE meeting_id=$1) + 1)` inlined into the CTE, or reject `end` with `VALIDATION_ERROR` when `last_seq` is far beyond `MAX(seq)` (a client that legitimately assigned seqs contiguously from 1 will never send an inflated value).

3. **The 24h abandoned-meeting sweep doesn't match its own partial index.** `idx_meetings_status` (`apps/api/src/database/migrations/1758000000003-CreateMeetingTables.ts:60-66`) is `WHERE status IN ('recording','queued','processing')` — it does **not** include `'paused'`. But `MeetingMaintenanceService.closeAbandonedMeetings()` (`apps/api/src/jobs/abandoned-meeting.job.ts:35-41`) filters `status IN ('recording','paused')`. Every 15-minute sweep therefore can't use the partial index for the `paused` branch of its own `IN` list and falls back to a wider index/seq scan on `meetings`.
   **Fix:** add a follow-up migration widening the predicate to `status IN ('recording','paused','queued','processing')` (or drop the `WHERE` and rely on `deleted_at`/status selectivity — table size still small, but cheap to fix now while it's a small, targeted migration).

4. **Breaking wire-contract change, correctly flagged in `blastRadius` but worth calling out explicitly in the verdict.** `packages/shared/src/websocket/websocket.types.ts` removes `speaker_label` from `TranscriptSegmentPayload`. This is a real breaking change to a public WS contract (any already-built mobile client sending `speaker_label` will have it silently dropped server-side via `whitelist: true`, not rejected). The comment says "US-13 was dropped," and `clarifications.md`/`study-context.json` both name this as deliberate, so I'm treating it as an intentional, documented contract change rather than a defect — flagging only so it's visibly tracked as `contractStatus: CHANGED`, not `OK`.

## Low
5. `MeetingMaintenanceService.requeueStrandedMeetings()` (`abandoned-meeting.job.ts:57-67`) filters `status = 'queued' AND updated_at < cutoff` with no supporting index on `updated_at`. Low risk at current expected `queued` cardinality (transient state), but worth a partial index if the maintenance queue ever backs up.
6. `SegmentDto`/`EndMeetingDto` caps (`seq <= 1_000_000`, `text <= 10_000` chars, bulk `<= 1000` items) are all sane and documented with their reasoning in comments — good practice, no action needed.

## Edge Cases Turned Up
- **Concurrent `end()` + in-flight WS segment for the same last seq**: traced both lock-acquisition orderings — either the segment is visible to `findMissingSeqs` (counted, `end` succeeds) or it is still uncommitted and blocked behind `end`'s transaction (reported missing, `end` returns 409 and the client retries `end`). No data loss either way.
- **`end()` with `last_seq` omitted**: per clarifications this means "meeting has no segments" and the server does *no* pending-segment check at all — this is a documented trust boundary the client must honor, not a code bug, but it means a buggy/malicious client can end a meeting with real segments still buffered simply by omitting `last_seq`. Worth knowing this is enforced by convention, not by the server.
- **Delete racing a buffered segment write**: DB row lock correctly serializes both orderings — either the segment lands then gets cascade-deleted (consistent — "deleted after ack" is a legitimate outcome), or the delete wins and the pending write is correctly rejected with `MEETING_NOT_FOUND` (covered by `meetings-lifecycle.e2e.spec.ts` / `meeting-gateway.e2e.spec.ts:128-139`).
- **`JwtAuthGuard`'s new `context.getType() !== 'http' → return true`**: verified the WS gateway (`MeetingGateway`) never relies on Nest's Guard mechanism — auth is handled entirely by `ws-auth.middleware.ts` at handshake plus an explicit ownership re-check in `join()`. This change does not open an unauthenticated path; it just stops the (already-inert-for-WS) global guard from throwing on a context type it can't read a header from.
- **Token expiry mid-connection**: `tokenExp` is captured once at handshake and checked per-`transcript_segment` message (`segment-ingest.handler.ts:45-47`) — a socket outliving its access token gets `TOKEN_EXPIRED` + forced disconnect, not silently accepted forever.

## Done Well
- Ack-after-commit is enforced by construction (the promise the writer returns only resolves post-transaction), not by convention — hard to regress silently.
- One F0R NO KEY UPDATE lock, taken first and only once, in every writer that touches a meeting's lifecycle or its segments — a genuinely deadlock-free design (no second lock acquired later in the same transaction to invert against).
- `ON CONFLICT (meeting_id, seq) DO NOTHING` plus "ack whether new or duplicate" gives exactly-once-effect semantics for resend without a read-then-write race.
- `ScopedRepository`/`MeetingsRepository`/`ParseMeetingIdPipe` make an unscoped or IDOR-prone query structurally hard to write, and 404-for-both-"missing"-and-"not yours" avoids the classic existence-oracle leak.
- Real fault-injection and real concurrent-reconnect e2e tests against actual Postgres, not mocks — the ack/durability claim is genuinely demonstrated, not asserted.
- File sizes are disciplined (max 134 lines in the changed set) and every non-obvious concurrency/locking decision has an inline comment explaining *why*, which is exactly what a reviewer six months from now will need.

## Actions In Order
1. Fix the bulk-segments error leak (High #1) — smallest change, closes a real data-leakage path.
2. Bound `findMissingSeqs`' `generate_series` range or validate `last_seq` against `MAX(seq)` (Medium #2) — closes a lock-held-during-scan DoS vector.
3. Migrate `idx_meetings_status` to include `'paused'` (Medium #3).
4. Confirm `contractStatus: CHANGED` is tracked wherever the mobile client consumes `TranscriptSegmentPayload` (Medium #4) — no code fix needed here, just don't let it get silently absorbed as "OK."

## Numbers
- Type coverage: not separately measured; `tsc` presumably runs clean (not independently re-run in this review — see Still Unresolved).
- Test coverage: not independently re-run; per the brief, 263/263 pass including the e2e suites (`src/meetings/__tests__`, `src/realtime/__tests__`) with real Postgres/Redis and DB-trigger fault injection. I read the fault-injection test and the SEGMENTS_PENDING/resend e2e tests directly and confirmed they assert what the brief claims.
- Lint findings: not run in this review (read-only pass; no `tsc`/`eslint`/`jest` executed).

## Still Unresolved
- The 10-minute load test (p95 ack latency) was still in progress per the brief and its result was not available to this review — left in `unproven` below, not treated as verified.
- This review did not itself execute `tsc`, `eslint`, or the Jest suites — it relied on reading the test files and the brief's reported 263/263 pass. If a hard gate requires re-running them, that should happen before sealing.

**Status:** DONE_WITH_CONCERNS
**Summary:** No critical/data-loss/auth-bypass defects found; the ack-after-durable and end/lock design are sound and genuinely tested. One High (raw error leakage on the bulk-segments fallback path) and three Medium findings (unbounded generate_series held under a row lock, a stale partial index missing `paused`, and a documented-but-real WS contract break) should be fixed or explicitly accepted before this is called done.
**Concerns/Blockers:** High #1 (data leakage) should block sealing until fixed or explicitly accepted; the 10-minute load test result is unproven pending its completion.
**Score:** 7/10

---

## Re-inspection — 2026-09-25

Coordinator reported High #1 and both Mediums fixed, plus the load test completed. Verified each claim directly in code and tests (not taken on trust):

1. **High — error-text leakage.** `apps/api/src/common/filters/api-exception.filter.ts:73-81`: for any non-`HttpException`, the client now always gets the fixed `INTERNAL_ERROR_MESSAGE` ('Lỗi hệ thống, vui lòng thử lại sau'); the real message + stack goes only to `this.logger.error` (line 90-92). This is a root-cause fix (the global filter), not a controller-local patch — it covers `meeting-segments.controller.ts`'s bulk path and every other endpoint alike. Confirmed the spec was updated to match: `api-exception.filter.spec.ts:54-58` asserts the fixed message for `new Error('boom')`, and a new case at line 64 asserts a raw Postgres unique-constraint message never reaches the body. **Verified fixed.**

2. **Medium — generate_series under the row lock.** `meetings/meetings.service.ts:76-96`: `end()` now does the ownership read, a fast pre-check `transition(current.status, 'end')`, `segmentWriter.flush(id)`, and `findMissingSeqs` all *before* opening the transaction; the transaction (`changeState` → `lockOwned`) only re-validates the transition under the lock. `segment-upsert.repository.ts:76-96` adds a fast path — one indexed `count(*) WHERE seq BETWEEN 1 AND lastSeq`, and only runs `generate_series` when that count is short. I traced the correctness argument independently: segment rows are append-only while a meeting is live (`ON CONFLICT DO NOTHING`, no updates that remove rows), and the only way a row disappears is the meeting itself being hard-deleted, which independently makes `changeState`'s `lockOwned` fail (the meeting is gone) rather than let a stale "not missing" verdict through — so "missing only shrinks" holds and the pre-lock check cannot let `end` succeed while a genuinely unpersisted segment is outstanding. The new deterministic e2e `realtime/__tests__/end-flushes-batch-writer.e2e.spec.ts` (5s batch window) proves `end` still flushes buffered WS segments before checking `last_seq`, and completes well inside the window (`Date.now() - started < 4000`), confirming the flush isn't skipped by the reorder. **Verified fixed**, and no longer holds the row lock during the scan.

3. **Medium — `paused` missing from the partial index.** New migration `apps/api/src/database/migrations/1758000000013-IndexPausedMeetingsForSweep.ts` drops and recreates `idx_meetings_status` as `WHERE status IN ('recording','paused','queued','processing')`, with a matching `down()` that restores the old predicate; `meeting.entity.ts`'s `@Index('idx_meetings_status', ...)` decorator was updated to the same `where` clause so the entity metadata and the live schema agree. **Verified fixed**, up/down is symmetric.

4. **Load test.** `plans/reports/load-test-2026-09-25-meeting-room.md`: 20 meetings × 2 seg/s × 600s, 24000/24000 acked, 0 errors, 0 missing/duplicate rows, p95 253ms / p99 372ms / max 588ms — comfortably under the 500ms p95 bar. The report itself notes the run predates fixes 1–3 and states none of them touch the ack path; I agree with that reasoning (the filter change only affects the client-visible error message on already-failed requests, the `end()` reorder only affects `POST /meetings/:id/end`, and the index only affects the 15-minute sweep — none sits on the segment-ack hot path). **Accepted as covering the "p95 < 500ms" criterion.**

5. **Test-suite race + tightened test.** `apps/api/package.json`: `test` now runs `test:unit && test:e2e`, and `test:e2e` runs `--runInBand`, addressing the parallel-e2e-vs-migration-revert race. Found the tightened test: `realtime/__tests__/meeting-gateway-gaps.e2e.spec.ts:73-92` ("refuses segments sent after the meeting was deleted, and leaves no rows behind") asserts both `segment_error` / `MEETING_NOT_FOUND` *and* a direct DB count of zero rows — not vacuous. Fresh `temper-results.json` shows `test:unit` 230/230, `test:e2e` 48/48, shared build, api + mobile typecheck, eslint 0 warnings, and the load-test entry, all exit 0.

6. **speaker_label removal.** Unchanged from the original review — correctly documented as intentional (US-13 dropped, `clarifications.md`), `contractStatus: CHANGED` is the right call, not a defect.

**Deferred, accepted:** the `requeueStrandedMeetings` `updated_at` index (Low) — reasonable to defer given tiny `queued` cardinality and the existing status filter.

No new issues surfaced during re-inspection. `criticalCount` is 0, all prior High/Medium findings are closed with a code-level fix I independently verified, `unproven` is now empty, and `contractStatus` stays `CHANGED` (tracked, not silently OK'd).

**Status:** DONE
**Summary:** All three prior findings (High error leakage, Medium lock-held scan, Medium missing-index) are fixed at the root and independently verified in code + tests; the load test clears its bar; nothing new found.
**Concerns/Blockers:** None blocking. `speaker_label` removal remains a tracked (not hidden) breaking WS contract change; `requeueStrandedMeetings` index left deferred by agreement.
**Score:** 9/10
