# Phase 10 (mobile half) + Phase 11 (mobile push) — implementation report

Scope: `apps/mobile/**` only. No `packages/shared/**` or `apps/api/**` changes.

## Files changed

### API layer
- `src/api/meetings.ts` (+84) — `listMeetings`, `getMeeting`, `updateMeeting`, `deleteMeeting`, `listSegments`, `updateSegment`, `reindexMeeting`, `getMeetingStatus`, `exportMeeting`. Test: `meetings.test.ts` (+130, 15 cases incl. 409 propagation).
- `src/api/push-tokens.ts` (+13) — register/unregister push token. Test: `push-tokens.test.ts`.

### Hooks
- `use-meetings-query.ts` — `useInfiniteMeetingsQuery` (Library, `next_cursor`).
- `use-recent-meetings-query.ts` — Home's real first page.
- `use-meeting-detail-query.ts` — `useMeetingQuery`.
- `use-meeting-mutations.ts` — update/delete/reindex mutations.
- `use-segments-query.ts` — `useInfiniteSegmentsQuery` (paged, 200/page).
- `use-segment-mutations.ts` — `useUpdateSegmentMutation`.
- `use-meeting-room-socket.ts` + test (5 cases) — joins `/meeting-room`, refetches meeting on `processing_status`/`meeting_ready`, leaves+disconnects on unmount.
- `use-delete-meeting-with-undo.ts` + test (3 cases) — 10s client-side undo window; DELETE fires only after the window elapses.
- `use-export-meeting-mutation.ts` — wraps the export/share flow as a mutation.
- `use-push-notifications-lifecycle.ts` + test (7 cases) — register on auth, unregister on logout, tap-to-navigate (incl. cold start).
- `use-debounced-value.ts` + test (3 cases) — generic debounce, used by Library search.

### Screens rewired off mocks
- `app/(app)/(tabs)/library.tsx` (179 lines) + `library-filters-header.tsx` (95 lines, extracted `ListHeaderComponent`) — real, `FlatList`-virtualized, infinite-scroll list (`onEndReached` → `fetchNextPage`, guarded by `hasNextPage && !isFetchingNextPage`, `onEndReachedThreshold={0.5}`, footer spinner via `ListFooterComponent`); server-side search (debounced 400ms) + status filter + date-range filter (`LibraryDateFilterSheet`, 144 lines); empty/no-results states covering all three filters; long-press → delete-with-undo banner.
- `app/(app)/(tabs)/index.tsx` — recent-meetings section now real (`useRecentMeetingsQuery`); `/me` gate unchanged.
- `app/(app)/meeting-detail.tsx` — real detail, inline autosave title (`MeetingDetailHero`), realtime via `useMeetingRoomSocket`, `MeetingProcessingStatus` (queued/processing step label, failed + Thử lại → reindex `scope:'changed'`), `has_unprocessed_edits` notice, kebab repurposed as the export entry point (`ExportSheet`).
- `app/(app)/meeting-transcript.tsx` + `src/components/transcript/real-transcript-screen.tsx` (188 lines) — paged, `FlatList`-virtualized, timestamps from `started_at_ms`, gap markers, edited badge, tap-to-edit → PATCH → Alert prompting reindex, jump to top/bottom/last-read (persisted via `transcript-read-position.ts`).
- `app/(app)/(tabs)/settings.tsx` + `settings-account-section.tsx` — new "Thông báo khi phân tích xong" toggle bound to `NotificationSetting.MEETING_READY_PUSH`, default-on when the key is missing per contract.

### New supporting UI/components
- `meeting-detail-hero.tsx`, `meeting-processing-status.tsx`, `export-sheet.tsx`, `transcript-segment-row.tsx` — each with its own test file.
- `library-filters-header.tsx` — Library's `ListHeaderComponent` (search, status chips, active date-range chip, undo banner), split out to keep `library.tsx` under the 200-line guidance.
- `library-date-filter-sheet.tsx` — US-21's date-range picker: three presets (7/30/90 ngày qua) plus a simple `DD/MM/YYYY` custom range (no native date-picker dependency added), "Xóa bộ lọc" resets both bounds.
- `status-badge.tsx` extended with a `failed` status (+ test); `meeting-status-badge-mapping.ts` maps server `MeetingStatus` → badge status.
- `meeting-list-row.tsx` gained an optional `onLongPress` (delete affordance).

### Utils
- `meeting-formatting.ts`, `meeting-detail-mappers.ts`, `processing-step-labels.ts`, `segment-formatting.ts`, `export-html-fonts.ts`, `export-file-name.ts`, `export-meeting.ts`, `date-range-formatting.ts` — each with tests.

### Push notifications
- `src/notifications/push-registration.ts` — permission + `getExpoPushTokenAsync`, skips with `console.warn` when no EAS project id (`Constants.expoConfig?.extra?.eas?.projectId` or `EXPO_PUBLIC_EAS_PROJECT_ID`); never throws.
- `src/notifications/meeting-ready-push-data.ts` — boundary type guard for the notification payload.
- `app/_layout.tsx` — wires `usePushNotificationsLifecycle()`.

### Config / deps
- `app.config.ts` — added `expo-sharing` and `expo-notifications` plugins.
- `package.json` — added via `npx expo install`: `expo-print`, `expo-sharing`, `expo-notifications`, `expo-file-system`; added `socket.io-client` via `yarn workspace @meetio/mobile add`.

### Pre-existing tests updated for the new contracts
`home-screen.test.tsx`, `recent-meetings-section.test.tsx`, `library-screen.test.tsx`, `meeting-detail-screen.test.tsx`, `settings-account-section.test.tsx`, `settings-screen.test.tsx`, `status-badge.test.tsx`, `root-layout-boot-gate.test.tsx` (added a mock for the new push-lifecycle hook so it doesn't pull in real `expo-notifications`).

## How each acceptance area is met

1. **API + hooks** — done, all contracts from `@meetio/shared` used verbatim (no shape re-declared).
2. **Library tab** — `useInfiniteMeetingsQuery` on `next_cursor`, now paged via `FlatList`'s `onEndReached` (infinite scroll, not a manual button) with a footer spinner while `isFetchingNextPage`; debounced server-side `q`; status filter chips; a date-range filter (`from`/`to`, ISO, bound to `created_at`) reached by wiring the previously-inert funnel button to `LibraryDateFilterSheet` — three presets or a simple typed `DD/MM/YYYY` custom range, combinable with search/status, with an active-filter chip ("Từ 01/09 – 25/09 ×") that clears it on tap; empty state + "no results" copy covers all three filters at once (generic "Xóa từ khóa hoặc bộ lọc…" wording, verified against date-only, status-only, and combined cases). See "Load testing at 500 meetings" below for what this couldn't verify.
3. **Home recent meetings** — real first page via `useRecentMeetingsQuery`; if that query is still loading/erroring, the section renders with an empty list rather than blocking the whole screen (the `/me` gate is the screen's real loading/error gate).
4. **Meeting detail** — real summary/action items/status; autosave title; live step label while queued/processing (joins `/meeting-room`); failed state + Thử lại → `reindex({scope:'changed'})`; `has_unprocessed_edits` label. Action-item checkbox toggling stays local/non-persisted — there is no PATCH-action-item endpoint in the contract, and the pre-existing UI comment already documented this as intentional.
5. **Transcript screen** — paged (`next_from_seq`, 200/page), `FlatList` virtualized (`windowSize`, `removeClippedSubviews`, batched rendering) rather than the mock's `ScrollView`; timestamps from `started_at_ms`; gap marker always shown when `gap_before_ms` is set; edited badge; inline edit → PATCH → Alert asking to reindex with a stated cost/time warning → `reindex({scope:'changed'})`; jump to top/bottom/last-read (persisted per-meeting in `expo-secure-store`).
6. **Delete + 10s undo** — `use-delete-meeting-with-undo.ts`; DELETE is scheduled with `setTimeout` and only actually sent once the window elapses without `undoDelete` — never delete-then-restore. Reached via long-press on a Library row (no dedicated delete affordance exists in the design) + a confirm `Alert` + an undo banner.
7. **Export** — section picker (`ExportSheet`, Markdown/PDF, per-section switches) reached from meeting-detail's kebab (repurposed — it was inert in the design). Markdown writes to `Paths.cache` via the new `File`/`Paths` class API (this expo-file-system version dropped `writeAsStringAsync`/`cacheDirectory`) and opens the share sheet. PDF fetches `format=html`, wraps it with a Vietnamese-safe font stack (`Noto Sans` + fallbacks, injected via `ensureVietnameseFontStack`) before `expo-print`, then shares the PDF. Nothing is uploaded.
8. **Push (US-30)** — `expo-notifications` permission + token flow; skips cleanly with `console.warn` when no EAS project id is configured (confirmed: this repo has none yet); registers on the `authStatus` transition to `authenticated`, unregisters on the transition to `unauthenticated`; tapping a `meeting_ready` notification (validated at the boundary via `isMeetingReadyPushData`) opens that meeting's detail, including a cold start via `getLastNotificationResponseAsync`. Settings toggle added and bound to `NotificationSetting.MEETING_READY_PUSH`, defaulting to on when the key is absent.
9. **Mocks left alone** — `meeting-graph.tsx`, `search.tsx`, and the whole recording flow are untouched. The old mock `TranscriptScreen`/`transcript-list.tsx` components are now unused by the route (replaced by `RealTranscriptScreen`) but were left in place rather than deleted, since deleting them was not requested and their own tests still pass standalone. `AudioPlayerBar` (decorative, no real playback) was kept in the real transcript screen as-is — wiring real audio playback was never in scope for either phase.

## Checks
- Typecheck: **clean** (`yarn workspace @meetio/mobile typecheck`).
- Unit tests: **729 passing, 0 failing** (131 suites) — `yarn workspace @meetio/mobile test`. Re-ran the Library suite 3x in a row after the `FlatList` switch to confirm the prior teardown flake is actually gone, not just lucky once.
- Lint: **clean**, 0 warnings/errors — `npx eslint --max-warnings=0 apps/mobile`.
- No `TODO`/`FIXME` left in any touched file; no unjustified `any`.
- Every touched/new file is under 200 lines (Library was split into `library.tsx` 179 + `library-filters-header.tsx` 95 + `library-date-filter-sheet.tsx` 144 to stay under the limit once it also owns the `FlatList`/date-sheet wiring).

### Fixing the FlatList/Jest teardown flake (not dropping the AC)
The original `VirtualizedList` "import a file after the Jest environment has been torn down" failure was a low-priority `_updateCellsToRender` `setTimeout` outliving the test. Fixed at the test-harness level, per the coordinator's direction, rather than by avoiding `FlatList`:
- `jest.useFakeTimers()` for the whole Library suite (so that internal timer never fires for real mid-test or after teardown), paired with `jest.runOnlyPendingTimers()` + `jest.useRealTimers()` in `afterEach`.
- Explicit `renderer.unmount()` for every rendered instance in `afterEach` (already in place from the prior pass, kept).
- Small `initialNumToRender={12}` / `windowSize={7}` on the Library `FlatList` (the transcript screen's `FlatList`, which needed this fix from the start, uses the same combination and has never flaked).
Ran the suite 3x back-to-back with no flake after the fix (see Checks above).

## What could not be verified without a device/backend
- The actual `apps/api` endpoints for segments/reindex/status/export/push-tokens are, per the task brief, still being built in parallel — nothing here was run against a live server; all hook/API-layer behavior is verified against mocked `apiClient`/hooks per this repo's existing testing convention (see `axios-client.test.ts`'s fake-adapter pattern, which the new API tests follow).
- The WebSocket `/meeting-room` flow is verified against a mocked `socket.io-client`, not a live server.
- Push notifications: permission prompts, real Expo push token issuance, and actual notification delivery/tap-to-open can only be exercised on a physical device (or a dev client) with a real EAS project id — none exists in this repo yet, which is exactly the condition the code is written to degrade gracefully under (`console.warn`, no crash). This was smoke-tested at the unit level only.
- PDF export's actual rendered Vietnamese-diacritic output (as opposed to the font-stack string being present in the HTML handed to `expo-print`) needs a real device/simulator to eyeball.
- `FlatList` virtualization's actual scroll smoothness at ~3600 segments (transcript) or 500 meetings (Library) cannot be measured in Jest — the windowing props (`windowSize`, `initialNumToRender`, `maxToRenderPerBatch`/default batching, `removeClippedSubviews` on transcript) are set per React Native's documented guidance but not perf-profiled on a device. Jest confirms the *wiring* (`onEndReached` → `fetchNextPage`, guarded correctly, exactly once), not frame timing.
- `LibraryDateFilterSheet`'s custom `DD/MM/YYYY` fields have no on-device keyboard/locale testing (e.g. numeric keypad ergonomics) — only parsing/validation logic is unit-tested.
- No `expo prebuild` or native build was run, per the task's instruction.

## Known simplifications / deviations (flagging, not hiding)
- Library switched from the mock's two hardcoded date-group sections ("Gần đây"/"Tuần trước") to one continuous server-ordered list — those groups were keyed off fixture ids with no server equivalent. (The new date-range *filter* is unrelated to this — it filters `created_at` server-side, not a client-side grouping.)
- `MeetingActionItem.assignee_entity_id` is shown verbatim (or a placeholder) rather than resolved to a display name — there is no entity-name lookup endpoint in this phase's contracts.
- The generic pre-existing "Thông báo" toggle (key `enabled`) was left as-is; the new US-30 toggle is a second, separate row bound to `meeting_ready_push`, per the task's explicit key name — not a replacement of the old one.
- The two previously-flagged deviations (Library's date-range filter had no UI wiring; Library used `ScrollView` + a manual button instead of `FlatList`) are now resolved — see the "Fixing the FlatList/Jest teardown flake" note above and item 2 in "How each acceptance area is met".

## Reviewer fix-verification pass (2026-09-25, second follow-up)

Fixed all five findings from `plans/reports/reviewer-2026-09-25-phase-10-11-mobile.md` (Score 7/10,
DONE_WITH_CONCERNS). `apps/mobile/**` only; no test files owned by the concurrent tester were
touched or removed — only new test files were added, plus edits to test files this implementer
wrote in earlier passes (`use-meeting-room-socket.test.tsx`, `use-push-notifications-lifecycle.test.tsx`,
`export-meeting.test.ts`, `real-transcript-screen.test.tsx`).

### HIGH 1 — WebSocket never recovered from a `TOKEN_EXPIRED` disconnect
`src/hooks/use-meeting-room-socket.ts` (rewritten, 148 lines):
- `auth` is now a **function** (`(cb) => cb({ token: useSessionStore.getState().accessToken })`),
  so socket.io-client reads the *current* store token on every (re)connection attempt instead of
  the stale object captured once at `io()` call time.
- Added `connect_error` (checks `error.data.code` for `TOKEN_EXPIRED`/`UNAUTHORIZED`) and
  `disconnect` (reason `'io server disconnect'`, which socket.io-client deliberately does not
  auto-retry) handlers that call the existing single-flight `refreshAccessToken()` from
  `src/api/axios-client.ts`, then `socket.connect()`.
- Room is rejoined on every successful `connect` event (initial connection and every recovered
  one), not just once at mount.
- If the refresh itself rejects (dead refresh token), recovery stops permanently
  (`socket.disconnect()`, a `stopped` flag guards against further attempts) — no infinite retry
  loop against a session that can never become valid again.
- `use-meeting-room-socket.test.tsx`: rewritten with a fake socket exposing `connect`; new
  `describe('token-expiry recovery', ...)` block (5 cases) proves refresh-then-reconnect-then-rejoin
  on `TOKEN_EXPIRED`, the same on a server-initiated disconnect, no recovery for ordinary
  disconnects/connect_errors, and no repeat refresh attempt after one has already failed.

### HIGH 2 — push-token unregister-on-logout always fired after tokens were already cleared
- `src/hooks/use-push-notifications-lifecycle.ts`: removed the reactive `unregisterCurrentPushToken()`
  call entirely — it structurally could never see a valid access token, since it only ran after
  `authStatus` had already flipped to `unauthenticated`, which only happens after `clearTokens()`.
- `src/hooks/use-auth-mutations.ts` (`useLogoutMutation`) and `src/hooks/use-account-mutations.ts`
  (`useDeleteAccountMutation`): now call `unregisterCurrentPushToken()` themselves, inside
  `mutationFn`, **before** the `/auth/logout` / `deleteMe` call — i.e. while the session is still
  authenticated and the access token the `DELETE` needs is still valid.
- `src/notifications/push-registration.ts`: `unregisterCurrentPushToken()` now bounded by a 3s
  internal timeout (`withTimeout`, with the timer properly cleared either way) so a hung network
  call can never block the logout flow that awaits it.
- New tests: `use-auth-mutations.test.tsx` and `use-account-mutations.test.tsx` (new files) prove
  the unregister call sees the pre-logout access token and runs strictly before the
  logout/delete request; `use-push-notifications-lifecycle.test.tsx` updated with a regression
  guard asserting the reactive call no longer happens; `push-registration.test.ts` gained a
  timeout-resolves-instead-of-hanging case.

### MEDIUM 1 — exported temp files never deleted
`src/utils/export-meeting.ts`: both the Markdown `File` and the PDF file `expo-print` produces are
now wrapped in `try { await Sharing.shareAsync(...) } finally { deleteQuietly(file) }` — deleted
whether the share succeeds or fails, and a failed delete itself is caught and logged rather than
masking a successful export. Documented, not silently accepted, the known iOS trade-off that
`shareAsync` can resolve before a slow target app finishes reading the file. `export-meeting.test.ts`
gained 4 cases: markdown/PDF cleanup on success, cleanup on a share failure (with the original error
still propagating), and a failed cleanup not masking a successful export.

### MEDIUM 2 — transcript search couldn't see matches in unloaded pages
New `src/hooks/use-fetch-all-pages-for-search.ts` (+test, 8 cases): while a search query has zero
matches in the currently loaded segments and `hasNextPage` is true, keeps calling `fetchNextPage`
(defensively capped at 50 pages — a 2h/~3600-segment meeting is ~18). `real-transcript-screen.tsx`
wires it in and shows a new `TranscriptSearchingBanner` ("Đang tìm trong toàn bộ transcript…")
while it's running, suppressing the flat "no results" empty state until the search has actually
exhausted every page. Extracted `TranscriptJumpControls` and `TranscriptSearchingBanner` out of
`real-transcript-screen.tsx` in the process to keep it under 200 lines (184 after). 4 new screen-level
tests cover: auto-fetch on a query with no local matches, the indicator showing, the empty state
being suppressed while searching, and no auto-fetch once a match is found or with no active query.

### LOW — segment edit didn't explicitly invalidate meeting detail
`src/hooks/use-segment-mutations.ts`: `useUpdateSegmentMutation`'s `onSuccess` now invalidates
`meetingQueryKey(meetingId)` alongside `segmentsQueryKey(meetingId)`, so `has_unprocessed_edits`
is guaranteed to refetch rather than relying on TanStack Query's default refetch-on-mount timing.
New test file `use-segment-mutations.test.tsx`.

### Verification after all five fixes
- Typecheck: clean.
- Unit tests: **763 passing, 0 failing** (137 suites) — up from 729/131 before this pass (10 new
  test files: `use-auth-mutations`, `use-account-mutations`, `use-segment-mutations`,
  `use-fetch-all-pages-for-search`, `transcript-jump-controls`, `transcript-searching-banner`, plus
  additions to five existing test files).
- Lint: clean, 0 warnings (two `no-require-imports` errors from a `jest.mock`-factory pattern
  already used elsewhere in this repo — e.g. `jest.setup.ts` — fixed with the same
  `eslint-disable-next-line` convention, not by rewriting the pattern).
- File-size discipline maintained: `use-meeting-room-socket.ts` grew to 148 lines (still under 200)
  from adding the recovery logic; `real-transcript-screen.tsx` grew from adding cross-page search
  then was split back down to 184 lines by extracting `TranscriptJumpControls` and
  `TranscriptSearchingBanner`.
- Did NOT touch or delete any test file this implementer did not author in an earlier pass — the
  concurrent tester's files were left untouched.

**Status:** DONE

**Summary:** Implemented the mobile halves of Phase 10 and Phase 11 end-to-end against the fixed `@meetio/shared` contracts — meetings/segments/export/push API layer and TanStack Query hooks, Library/Home/Meeting-detail/Transcript wired off mocks onto real data with realtime updates via `/meeting-room`, client-side 10s delete-undo, Markdown/PDF export with a share sheet, and Expo push registration/unregistration/tap-routing with a Settings toggle. Two follow-up passes then closed: (1) two reviewer-flagged acceptance gaps in Library (real `FlatList` infinite scroll, a combinable date-range filter), and (2) all five findings from the adversarial code review — the WebSocket's token-expiry recovery (High), push-token unregister-before-clearTokens ordering (High), exported temp file cleanup (Medium), transcript search across unloaded pages (Medium), and an explicit meeting-detail cache invalidation on segment edit (Low). Typecheck, full test suite (763 tests, 137 suites), and lint are all clean; only `apps/mobile/**` was touched throughout.

**Concerns/Blockers:** None blocking. One item still worth a follow-up decision from product/design: action-item assignee names can't be resolved to real names until an entities-lookup endpoint exists (unchanged from the original report). The reviewer's own "Still Unresolved" items (real push delivery, on-device PDF diacritic rendering, `FlatList` scroll smoothness at real scale, custom-date-field keyboard ergonomics) remain genuinely out of reach without a device, as noted in both reviews.
