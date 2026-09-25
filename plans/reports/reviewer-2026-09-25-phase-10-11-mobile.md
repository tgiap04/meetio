# Review: Phase 10 + 11 Mobile (apps/mobile)

Follow-up adversarial review, mobile half only (backend half — see
`reviewer-2026-09-25-phase-10-11-backend.md`, now updated with a fix-verification appendix).
Cross-checked against `plans/reports/implementer-2026-09-25-phase-10-11-mobile.md` and the same
`clarifications.md` used for the backend pass.

## Scope
- Files reviewed: `src/api/{meetings,push-tokens}.ts`; hooks
  (`use-meetings-query`, `use-recent-meetings-query`, `use-meeting-detail-query`,
  `use-segments-query`, `use-segment-mutations`, `use-meeting-mutations`,
  `use-meeting-room-socket`, `use-delete-meeting-with-undo`,
  `use-export-meeting-mutation`, `use-push-notifications-lifecycle`); screens
  `app/(app)/(tabs)/library.tsx`, `meeting-detail.tsx`, `meeting-transcript.tsx` +
  `real-transcript-screen.tsx`, `app/_layout.tsx`; `src/notifications/{push-registration,
  meeting-ready-push-data}.ts`; export path (`export-meeting.ts`, `export-sheet.tsx`,
  `export-file-name.ts`, `export-html-fonts.ts`); `src/api/axios-client.ts` +
  `src/store/session.store.ts` (read to trace the logout/token-refresh timing the review brief
  asked about).
- Depth: full read of every file above, plus their test files, cross-referenced against
  `docs/api-spec.md` contracts and `packages/shared` types the backend review already verified.
- Verified independently: `yarn workspace @meetio/mobile typecheck` (clean), `eslint --max-warnings=0
  apps/mobile` (clean), `yarn workspace @meetio/mobile test` — **729/729 passing**.

## Assessment
The rewiring itself is careful and matches the shared contracts exactly — no re-declared wire
shapes, no drift from `docs/api-spec.md`. Pagination, filters, error-code mapping, and the
delete-undo timer are all correctly built and match their explicit spec/clarification. Two real
gaps surfaced by reading the code (not by running it), both squarely in the areas the review brief
asked to check by name: the WebSocket hook has no path back to a working connection once the
access token it authenticated with expires, and the push-token "unregister on logout" call is
wired to run **after** the credential it needs has already been cleared, so it fails silently every
time. Both are High findings; nothing here rises to Critical since neither breaks a contract,
leaks meaningful content (pushes are already generic per NFR-01), or loses data.

## Critical
None found.

## High
1. **`useMeetingRoomSocket` never recovers from the server-side `TOKEN_EXPIRED` disconnect the
   review brief named.** `apps/mobile/src/hooks/use-meeting-room-socket.ts:31-35`: `auth: {
   token: accessToken }` is a plain object captured once, at `io()` call time. socket.io-client
   v4's default `reconnection: true` will keep retrying the connection automatically, but it
   resends this same static `auth` payload on every attempt — so once the server disconnects the
   socket for an expired token (as the review brief states it does), every automatic reconnect
   attempt presents the same now-expired token and is rejected again, forever. Nothing in this
   hook listens for `'disconnect'`/`'connect_error'`, and the socket is only torn down and rebuilt
   when `accessToken` in the Zustand store changes — which happens only as a side effect of some
   *unrelated* HTTP call hitting a 401 and running `refreshAccessToken()`
   (`apps/mobile/src/api/axios-client.ts:62-85`). A user sitting on the meeting-detail screen
   watching a `processing` meeting, with no other screen making HTTP calls, will silently stop
   receiving `processing_status`/`meeting_ready` events once the access token's TTL passes — with
   no visible "reconnecting" state, no error, nothing to prompt a manual refresh. Confirmed no test
   exercises this: `use-meeting-room-socket.test.tsx` only asserts the static
   `auth: { token: 'token-1' }` shape, matching the implementation rather than a token-rotation
   scenario.
   Fix: pass `auth` as a function (`(cb) => cb({ token: useSessionStore.getState().accessToken
   })`), which socket.io-client re-evaluates on every (re)connection attempt, and add a
   `socket.on('connect_error', ...)` (or a specific disconnect-reason check) that calls
   `refreshAccessToken()` and then `socket.connect()` — mirroring the retry-after-refresh pattern
   `axios-client.ts` already uses for HTTP.

2. **Push-token unregister-on-logout is wired to run after the credential it needs is already
   gone, so it fails every time in the normal logout path — the "signed-out device stops receiving
   another account's pushes" guarantee the code's own comment states is never actually met.**
   Traced end to end: `useLogoutMutation`'s `onSettled`
   (`apps/mobile/src/hooks/use-auth-mutations.ts:39-46`) calls `useSessionStore.getState().clearTokens()`,
   which sets `accessToken: null` and `authStatus: 'unauthenticated'` in one atomic Zustand
   `set()` (`apps/mobile/src/store/session.store.ts:36`). `usePushNotificationsLifecycle` reacts to
   that *same* state transition and calls `unregisterCurrentPushToken()`
   (`apps/mobile/src/hooks/use-push-notifications-lifecycle.ts:24-26`), which calls the real
   `DELETE /users/me/push-tokens` through `apiClient`. `apiClient`'s request interceptor
   (`apps/mobile/src/api/axios-client.ts:54-60`) reads `accessToken` from the store **at request
   time** — which is already `null`, since the transition that triggered this call is the same one
   that cleared it. The request goes out with no `Authorization` header at all, the backend's
   global `JwtAuthGuard` rejects it with 401 (not `TOKEN_EXPIRED`, so the interceptor's refresh
   path doesn't even engage), `unregisterPushToken` rejects, and the `try/catch` in
   `unregisterCurrentPushToken` (`push-registration.ts:74-79`) swallows it with a `console.warn`.
   Net effect: the `push_tokens` row for this device is never deleted on logout. It is only
   overwritten the next time *some* account registers that same token (the backend's `ON CONFLICT
   (token) DO UPDATE` — a correct, intentional design on the backend side, verified in the prior
   backend review). Until then, this device keeps receiving generic `meeting_ready` pushes for the
   account that just logged out. Confirmed this is exactly the "only works against mocks" case the
   review brief warned about: `use-push-notifications-lifecycle.test.tsx:70-77` and
   `push-registration.test.ts:111-115` both mock `unregisterPushToken`/`../api/push-tokens`
   directly, so neither test ever exercises the real `apiClient` interceptor chain or the
   store-clearing race — the bug is invisible to the existing suite by construction.
   Fix: capture the token and call the unregister endpoint **before** `clearTokens()` runs — e.g.
   have `useLogoutMutation`'s `mutationFn` (which still runs while authenticated) call
   `unregisterCurrentPushToken()` itself ahead of the `/auth/logout` call, rather than relying on
   `usePushNotificationsLifecycle`'s reactive `authStatus` watcher, which structurally always fires
   too late. The same race applies to `use-account-mutations.ts`'s account-deletion flow
   (`clearTokens()` at line ~29-30) if it performs any authenticated cleanup call after clearing —
   worth checking, though account deletion's server-side cascade likely removes the `push_tokens`
   row anyway once the account is hard-deleted.

## Medium
1. **Exported files are never cleaned up after sharing — personal transcript/summary content
   accumulates indefinitely in the app's cache.** `apps/mobile/src/utils/export-meeting.ts:37-43`
   writes Markdown to `new File(Paths.cache, \`${baseName}.md\`)` with `overwrite: true` (so only
   *same-title* re-exports are deduped) and never calls `file.delete()` after
   `Sharing.shareAsync` resolves; the PDF path (`Print.printToFileAsync`) has the same shape — the
   temp PDF `expo-print` creates is never removed either. Every export of a *different* meeting (or
   the same meeting after a title change, which changes `sanitizeExportFileName`'s output) leaves
   another file sitting in the app's cache sandbox. Not attacker-reachable (app-sandboxed
   directory), but it is personal meeting content — transcripts and summaries — persisting on disk
   for longer than the export/share operation needs it to, which is exactly the kind of thing
   check #8 (data leakage / retention) asks to look for, and the review brief named "export temp
   files/leakage" specifically.
   Fix: `await file.delete()` (or the `expo-print` PDF equivalent) once `Sharing.shareAsync`
   resolves — note `shareAsync` on iOS resolves once the *share sheet* is dismissed, which may be
   before some target apps finish reading the file, so a short delay or a documented trade-off is
   worth an explicit decision rather than an implicit gap; at minimum, clean up stale exports from
   a previous session on next app launch.

2. **Transcript search cannot find text that exists beyond the pages already loaded, and silently
   reports "no results" instead.** `apps/mobile/src/components/transcript/real-transcript-screen.tsx:57-60`
   filters only the segments already fetched (`segmentsQuery.data?.pages`, 200/page via
   `use-segments-query.ts`) — `matchesQuery` never triggers `fetchNextPage()` on its own. The
   `FlatList`'s `onEndReached` (the only thing that calls `handleLoadMore`,
   `real-transcript-screen.tsx:83-87`) fires based on scroll position within the *currently
   rendered* (already-filtered) list; React Native's `FlatList` does not fire `onEndReached` for an
   empty `data` array (there is no scrollable content to reach the end of). So: type a search term
   that has zero matches in the first loaded page(s) of a long (~3600-segment) meeting, and the
   screen shows `ListEmptyComponent` ("Không tìm thấy kết quả phù hợp") permanently — the remaining
   pages that might contain a match are never fetched, because the empty list can't scroll to
   trigger the fetch that would prove otherwise. This is invisible on short transcripts (everything
   fits in the first page) and only manifests on exactly the long-meeting case US-23 is meant to
   serve.
   Fix: when a non-empty search query has zero matches in the currently loaded pages and
   `hasNextPage` is still true, keep calling `fetchNextPage()` in a `useEffect` (bounded, e.g. stop
   after N pages or add a "kết quả có thể chưa đầy đủ, đang tải thêm…" indicator) rather than
   relying solely on scroll-triggered `onEndReached`.

## Low
1. `useUpdateSegmentMutation` (`apps/mobile/src/hooks/use-segment-mutations.ts:11`) invalidates
   only `segmentsQueryKey`, not `meetingQueryKey` — the meeting detail's `has_unprocessed_edits`
   flag flips server-side the moment a segment is saved, but the cached meeting-detail query isn't
   explicitly told to refetch. In practice this is very likely masked by TanStack Query's default
   `staleTime: 0` + `refetchOnMount`, since the transcript and detail screens are different routes
   (remounting on navigation back), but it's relying on that default rather than stating the
   invalidation explicitly — a `queryClient.invalidateQueries({ queryKey: meetingQueryKey(meetingId)
   })` alongside the existing one would make the contract robust to a future navigation-stack
   change (e.g. presenting transcript as a modal that doesn't unmount detail underneath).
2. `useDeleteMeetingWithUndo` (`apps/mobile/src/hooks/use-delete-meeting-with-undo.ts:37-39`)
   deliberately **cancels** (not commits) a pending delete if its owning component unmounts before
   the 10s window elapses — documented in the code's own comment as intentional ("no toast left to
   offer undo once it's gone"). Verified this is low-risk in practice: the Library tab is not
   configured with `unmountOnBlur` (`app/(app)/(tabs)/_layout.tsx`), so ordinary tab switching does
   not unmount it and the timer survives. The only way to lose a pending delete is a hard unmount
   (logout, app kill, or an OS memory reclaim) — in which case silently not deleting is the safer
   failure mode of the two. No fix needed; flagging as a confirmed, deliberate trade-off per the
   review brief's explicit ask about this race.

## Edge Cases Turned Up (scouting pass)
- **Delete-undo race**: traced `startDelete`/`undoDelete`/the `setTimeout` in
  `use-delete-meeting-with-undo.ts` against the explicit review question ("DELETE must never be
  sent before 10s or after undo, including when leaving the screen") — confirmed correct: the
  `setTimeout` is the only path that calls `deleteMutation.mutate`, `undoDelete`/unmount both go
  through `clearTimer()` first, and there is no code path that could send the DELETE early or
  twice.
- **Notification tap routing**: `usePushNotificationsLifecycle` handles both a live tap
  (`addNotificationResponseReceivedListener`) and a cold start
  (`getLastNotificationResponseAsync`), both validated through `isMeetingReadyPushData` before
  navigating — correct, and both paths are covered by tests exercising the real handler function
  (not a stub).
- **Query invalidation on reindex**: `useReindexMeetingMutation` correctly invalidates
  `meetingQueryKey` so `has_unprocessed_edits`/`status`/`processing_steps` refresh after a manual
  retry or a transcript-edit-triggered reindex — checked against both call sites
  (`meeting-detail.tsx`'s "Thử lại" and `real-transcript-screen.tsx`'s post-edit prompt).
- **Error-code coverage**: `error-messages.ts`'s `FALLBACK_MESSAGES` table covers every
  `ApiErrorCode` variant `@meetio/shared` currently exports (checked exhaustively against the enum,
  not spot-checked) — a code the backend adds later without a mobile update would still show the
  server's own `message` field (checked first), so this degrades gracefully rather than showing
  nothing.
- **Export escaping is a backend concern, already verified in the prior review** — the mobile side
  only fetches the pre-rendered body and hands it to `expo-print`/the share sheet; confirmed no
  re-parsing or re-templating of the HTML happens client-side beyond the font-stack injection in
  `export-html-fonts.ts`, which only rewrites `<head>`/wraps the document, and does not touch the
  server-escaped segment/summary content.
- **US-20/21/23–27/28/30 coverage**: walked each against the implementer's own "How each acceptance
  area is met" section and the code — Library pagination+filters (US-20/21), transcript paging+edit
  (US-23/24), reindex scoping (US-24), export (US-27), realtime status (US-28), and the push setting
  toggle (US-30) are all wired to the real endpoints with matching contracts. US-26 (delete+undo) is
  correct per the edge-case check above. The two High findings above are defects *within* US-28
  (realtime) and US-30 (push) respectively, not missing coverage — the features exist and mostly
  work; they degrade silently under specific, real conditions (token expiry, logout).

## Done Well
- No wire shape is redeclared anywhere in `src/api/meetings.ts` — every request/response type comes
  straight from `@meetio/shared`, which is exactly what keeps a mobile/backend contract drift from
  being possible to introduce by accident.
- `exportMeeting`'s `responseType: 'text'` + `transformResponse: (v) => v` is the correct, easy-to-
  get-wrong detail for consuming a non-JSON (Markdown/HTML) response body through an axios instance
  otherwise configured for JSON — confirmed this was deliberate, not an oversight.
- `sanitizeExportFileName` correctly reduces to `[\p{L}\p{N}_-]` only, so a crafted meeting title
  cannot produce a path-traversal or header-injection-shaped filename — checked against `../`,
  `/`, and control characters.
- The Library `FlatList` rewrite (replacing the mock's `ScrollView` + manual button) is genuinely
  virtualized with sane windowing props, and the report's account of fixing the Jest teardown flake
  by fixing the test harness (fake timers + explicit unmount) rather than avoiding `FlatList`
  altogether is the right call — confirmed by re-running the suite, no flake.

## Actions In Order
1. Fix the WebSocket reconnect-with-fresh-token gap (High #1) before this ships — realtime status
   is one of the two features (US-28) this phase exists to deliver, and it degrades invisibly.
2. Move the push-token unregister call to before `clearTokens()` in the logout flow (High #2), and
   check whether the same ordering issue exists in `use-account-mutations.ts`.
3. Clean up exported files after sharing (Medium #1).
4. Make transcript search keep loading pages when the filtered result is empty but more pages
   remain (Medium #2).
5. Add an explicit `meetingQueryKey` invalidation to `useUpdateSegmentMutation` for robustness
   (Low #1) — cheap, removes a reliance on default refetch timing.

## Numbers
- Type coverage: `tsc --noEmit` clean, 0 errors.
- Test coverage: 729/729 passing (131 suites), verified by running, not by trusting the hand-off
  summary.
- Lint findings: 0 (`eslint --max-warnings=0`).
- File-size discipline: Library was split into three files to stay under 200 lines each, confirmed
  by inspection (179 + 95 + 144).

## Still Unresolved
- Everything the implementer's own report lists under "What could not be verified without a
  device/backend" (real push delivery, on-device PDF diacritic rendering, `FlatList` scroll
  smoothness at real scale, keyboard ergonomics for the custom date fields) remains genuinely out
  of reach in this environment — I did not attempt to fake verification of these, and none of them
  are named acceptance criteria in `study-context.json`, so they do not block the verdict below.
- `MeetingActionItem.assignee_entity_id` shown unresolved (no entity-lookup endpoint yet) — a
  known, flagged deviation, not a defect of this phase's scope.

**Status:** DONE_WITH_CONCERNS
**Summary:** Mobile rewiring is contract-correct and well-tested (729/729, clean typecheck/lint),
but two High findings were found by reading the code across module boundaries rather than by
running any single test: the meeting-room WebSocket has no path back to a working connection after
the token it authenticated with expires (the exact scenario the review brief named), and the
push-token unregister-on-logout call is wired to fire after the credential it needs is already
gone, so it silently fails on every normal logout — both invisible to the existing suite because
each is tested with the dependency that would expose the bug mocked out. Two Medium findings
(export files never cleaned up; transcript search can't see matches beyond loaded pages) round out
a solid but not flawless mobile half.
**Concerns/Blockers:** Not blocking for a SEALED verdict (see inspection-verdict.json — no
criticals, no refuted/unproven acceptance criteria, no reachable regressions), but High #1 and #2
should be fixed before this reaches real users, since both defeat a stated design intent (realtime
status staying live; a logged-out device no longer receiving another account's pushes) under
ordinary, not edge-case, conditions.
**Score:** 7/10

---

## Follow-up (2026-09-25): all five findings verified fixed

Re-read every changed file directly rather than trusting the implementer's "Reviewer
fix-verification pass" section — here is what each fix actually does, confirmed in code:

1. **High 1 (WS token-expiry recovery)** — `use-meeting-room-socket.ts:60-119`. `auth` is now
   `(callback) => callback({ token: useSessionStore.getState().accessToken })`, a function
   socket.io-client re-invokes on every connection attempt including its own automatic retries —
   confirmed this actually reads the *current* store value, not a closed-over one. `connect_error`
   checks `error.data?.code` for `TOKEN_EXPIRED`/`UNAUTHORIZED`; a `disconnect` with reason `'io
   server disconnect'` (the one socket.io-client deliberately does not auto-retry) triggers the
   same recovery path. Both funnel into `recoverFromExpiredToken()`, which uses the exact
   single-flight `refreshAccessToken()` HTTP already relies on, guards re-entrancy with
   `isRecovering`, and — the detail that matters most — sets `stopped = true` and disconnects for
   good if the refresh itself rejects, rather than retrying against a session that can never become
   valid again. The room is rejoined on every `connect`, initial or recovered, via a single
   `handleConnect`. `use-meeting-room-socket.test.tsx`'s new `token-expiry recovery` suite exercises
   all four branches: successful `TOKEN_EXPIRED` recovery + rejoin, server-disconnect recovery, a
   non-auth `connect_error` correctly NOT triggering recovery, and a dead refresh token correctly
   stopping (not looping) recovery. **Confirmed fixed, no gaps found.**
2. **High 2 (push unregister ordering)** — `push-registration.ts:96-113` now documents the exact
   bug in its own doc comment and points to the correct call sites. Verified both:
   `use-auth-mutations.ts:40-49`'s `useLogoutMutation` and `use-account-mutations.ts:24-31`'s
   `useDeleteAccountMutation` both call `await unregisterCurrentPushToken()` as the *first*
   statement in `mutationFn`, strictly before `logoutRequest()`/`deleteMe()`, i.e. while the access
   token is still valid and attached by the interceptor. `withTimeout` bounds the call at 3s so a
   hung network request can't hang logout. Confirmed the reactive call site was *removed* from
   `use-push-notifications-lifecycle.ts` (not left duplicated) — its doc comment now explains why
   unregister does not belong there. **Confirmed fixed.**
3. **Medium 1 (export cleanup)** — `export-meeting.ts:59-79`. Both the Markdown and PDF paths now
   wrap `Sharing.shareAsync` in `try/finally` with `deleteQuietly(file)` in the `finally`, so the
   temp file is removed whether the share succeeds or fails. The iOS early-resolve caveat (share
   sheet dismissal vs. a slow target app still reading the file) is called out in a comment as a
   stated trade-off rather than silently ignored — exactly the kind of honesty the original finding
   asked for. **Confirmed fixed.**
4. **Medium 2 (search + pagination)** — new `use-fetch-all-pages-for-search.ts`, a small, well-
   isolated hook: `isSearchingAllPages = hasQuery && !hasMatches && hasNextPage` drives a bounded
   auto-fetch loop (capped at 50 pages — more than double what an 18-page, 3600-segment 2h meeting
   would ever need), reset per search term via `searchKey`. Wired into
   `real-transcript-screen.tsx:64-70`, and a `TranscriptSearchingBanner` replaces the bare empty
   state while it runs. This correctly fixes the exact mechanism the finding named (`onEndReached`
   never firing against an empty list) rather than working around the symptom. **Confirmed fixed.**
5. **Low (segment-edit query invalidation)** — `use-segment-mutations.ts:12-19` now invalidates
   `meetingQueryKey(meetingId)` alongside `segmentsQueryKey`, with a comment stating exactly why
   (don't rely on remount timing). **Confirmed fixed.**

Also verified the backend addition mentioned in passing: a new integration test in
`pipeline-engine.integration.spec.ts` ("a step still running when its meeting is deleted finishes
as a no-op and schedules nothing") starts a `chunk` handler, hard-deletes the meeting mid-run from
Postgres, then lets the handler resolve — asserting `embed` never enqueues and `processing_jobs`
cascades to zero rows. This is a stronger, real proof of the mid-run-delete guard than the code-
reading I did in the original pass (the store-guard logic was correct then too, but now it's
pinned by an actual test against real Postgres rather than by inspection alone).

Re-ran everything myself, not just re-read the diff: `yarn workspace @meetio/api test` → **268
unit + 80 e2e = 348/348**; `yarn workspace @meetio/mobile test` → **763/763**; both workspaces'
`typecheck` clean; `eslint --max-warnings=0` across the whole repo clean. All figures match the
implementer's `temper-results.json` exactly (which itself validates cleanly against
`evidence-validator.cjs` at the hard stage).

**Updated Status:** DONE — all five mobile findings fixed and independently verified in code (not
just re-run), zero regressions, zero new findings from re-reading the changed and surrounding
files.
**Updated Score:** 9/10 (parity with the backend's post-fix score; held back from 10 only because
the device-dependent items — real push delivery, on-device PDF rendering, actual scroll
performance — remain, as always, out of reach in this environment, not because of any remaining
code defect).
