# Phase 15 mobile — GraphRAG Q&A chat

**Status**: completed

## Scope
Mobile side only (`apps/mobile/**`), coded against the already-built contract
`packages/shared/src/qa/qa.types.ts` and mocked HTTP in tests, matching the
existing API-test convention. Backend (`apps/api/src/qa/**`) is out of scope
and untouched.

## Files created
- `src/api/qa.ts` (50) + `.test.ts` (85) — the six endpoints, thin wrappers
  over `apiClient`, mirroring `src/api/actions.ts`'s shape.
- `src/hooks/use-qa-history-query.ts` (54) + `.test.tsx` (128) —
  `useMeetingQaHistoryQuery` / `useGlobalQaHistoryQuery` (paged backward via
  `next_before`) and `flattenQaHistoryPages`, the pure function that turns
  TanStack's most-recent-page-first `pages` array into an oldest-first list.
- `src/hooks/use-qa-mutations.ts` (46) + `.test.tsx` (99) — ask/delete
  mutations for both threads; delete invalidates its own history query key.
- `src/hooks/use-qa-thread.ts` (113) + `.test.tsx` (176) — the shared,
  generic (`<TRequest>`) chat state machine: optimistic pending turn, confirmed
  question/answer appended from the mutation response (no cache round-trip),
  retry-with-last-request, and MEETING_NOT_READY routed to a
  thread-blocking flag rather than a retryable bubble.
- `src/hooks/use-entity-search-query.ts` (22) + `.test.tsx` (57) — small,
  non-paged `GET /entities?q=` for the global filter's autocomplete.
- `src/utils/qa-formatting.ts` (44) + `.test.ts` (28) — citation `dd/MM` and
  the global filter's `DD/MM/YYYY` parse.
- `src/components/citation-chip.tsx` (59) + `.test.tsx` (46) — the shared
  citation chip (meeting title + date; `available:false` renders disabled).
- `src/components/qa/*` — 11 presentational pieces (bubbles, composer,
  inverted thread list, typing/error/not-ready states, and the global filter
  bar with its date-range and entity pickers), each under 90 lines; the
  composer, assistant bubble and filter chips also carry `.test.tsx`.
- `src/components/meeting-detail/ask-ai-fab.tsx` (40) — the floating "Hỏi AI"
  button on meeting detail.
- `app/(app)/meeting-chat.tsx` (118), `app/(app)/ask.tsx` (125) — the two
  screens, both thin: wire the history/mutation hooks into `useQaThread`,
  render `QaThreadList` + `QaComposer`, handle citation taps
  (`MEETING_TRANSCRIPT_ROUTE?seq=`) and "Xóa lịch sử" (confirm, then
  `thread.deleteHistory()`).
- `src/components/meeting-chat-screen.test.tsx` (156),
  `src/components/ask-screen.test.tsx` (147) — screen-level behavior tests.
  **Placed under `src/components/`, not beside the screens in `app/`** —
  `src/navigation/route-shape.test.ts` asserts zero `*.test.tsx` files
  anywhere under `app/`; this mirrors the existing
  `src/components/actions-screen.test.tsx` convention exactly.

## Files modified
- `src/navigation/app-routes.ts` — added `MEETING_CHAT_ROUTE`, `ASK_ROUTE`.
- `app/(app)/meeting-detail.tsx` — renders `<AskAiFab>`, pushing
  `MEETING_CHAT_ROUTE` with the meeting id.
- `app/(app)/(tabs)/index.tsx` — added the fourth secondary row, "Hỏi AI về
  các cuộc họp" → `ASK_ROUTE`.
- `app/(app)/entity-detail.tsx` — added "Hỏi về thực thể này" → `ASK_ROUTE`
  with `entityId`/`entityName` params; updated the docstring that previously
  said this affordance was deliberately deferred to this phase.
- `src/components/home/home-screen.test.tsx` — updated to account for the
  new fourth secondary row and its own test (button indices shifted); added
  a new test asserting it routes to `ASK_ROUTE`.

## Design decisions worth flagging
- **No cache round-trip on ask.** `useQaThread` appends the mutation's own
  `AskResponse` (question + answer) straight into local state instead of
  invalidating/refetching history — avoids a flicker where the optimistic
  bubble would briefly disappear before the refetch lands, and keeps the
  hook trivially testable without a `QueryClient`.
- **`useQaThread` is generic over the request type** so one implementation
  serves `AskMeetingRequest` (`{ question }`) and `AskGlobalRequest` (adds
  optional filters) — DRY across both screens, including retry (stores the
  exact last request object, filters included).
- **MEETING_NOT_READY (409) is NOT a bubble.** Every other ask failure
  (429/503/etc.) becomes a retryable error on the pending bubble; 409 instead
  flips `meetingNotReady`, which the meeting-chat screen uses to swap the
  composer for `QaNotReadyNotice` — matches "disables input" in the task,
  rather than just showing an error the user could retry into another 409.
- **Global filter bar starts expanded when an entity is preselected**
  (`QaFilterBar`'s `useState(Boolean(filters.entityId))`) so the "Hỏi về
  thực thể này" entry point shows the chosen entity immediately rather than
  behind a closed accordion.
- **Citation chip and filter-date formatting share no code with
  `action-item-format.ts`** despite the same `DD/MM/YYYY` shape — that file
  is due-date domain; a new `qa-formatting.ts` keeps the two call sites
  independent (documented in its own header comment) rather than coupling
  two unrelated features through one shared util.

## Checks
- Typecheck (`yarn workspace @meetio/mobile typecheck`): **clean**.
- Unit tests (`yarn workspace @meetio/mobile test`): **193 suites / 1050
  tests passing**, including all newly added Q&A tests and the existing
  suite (home screen, navigation graph, route shape — all green after the
  index-shift and file-placement fixes above).
- ESLint (`npx eslint --max-warnings=0 apps/mobile`): **clean, zero
  warnings**.

## Acceptance criteria
- [x] Meeting chat: history load, optimistic user bubble + typing indicator,
  "Xóa lịch sử" with confirm — `app/(app)/meeting-chat.tsx`,
  `src/components/meeting-chat-screen.test.tsx`.
- [x] Global chat: one thread, optional date-range + entity filters, filter
  chips on the asking bubble via `QaMessage.filters` —
  `app/(app)/ask.tsx`, `src/components/qa/qa-filter-bar.tsx`.
- [x] Entity detail "Hỏi về thực thể này" → global chat with entity
  preselected — `app/(app)/entity-detail.tsx`.
- [x] Citation chips (meeting + `dd/MM`), tap → transcript at `?seq=`,
  `available:false` → disabled "đoạn này đã thay đổi" —
  `src/components/citation-chip.tsx`.
- [x] `not_found` → plain notice, `low_confidence` → visible warning —
  `src/components/qa/qa-assistant-bubble.tsx`.
- [x] 409 disables input; 429/503 retryable on the failed bubble —
  `src/hooks/use-qa-thread.ts`.
- [x] Pagination: older messages load on scroll-to-top via inverted
  `FlatList` + `onEndReached` — `src/components/qa/qa-thread-list.tsx`.
- [x] Vietnamese copy throughout; every new file under ~130 lines.

## Issues / concerns
- No backend to integrate against yet (expected — built in parallel); every
  test mocks the hook/HTTP boundary per the task's instruction.
- The global date-range filter is a plain `DD/MM/YYYY` text pair
  (`QaDateRangePicker`), not a native date picker — no design exists for
  this screen and a text field was the lowest-risk choice reusing an
  established parse shape; flagging in case a native picker is wanted later.
- A pre-existing Jest quirk (unrelated to this phase): the mobile suite logs
  "A worker process has failed to exit gracefully" / act() warnings from
  `@expo/vector-icons`' async font-loading `Icon` component and from
  TanStack Query's internal timers in some other, pre-existing test files —
  present before this change too; it does not affect the pass/fail result
  (193/193 suites, 1050/1050 tests green either with or without
  `--forceExit`).
