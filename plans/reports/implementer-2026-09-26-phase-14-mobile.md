# Implementer report — Phase 14 mobile (summary & action items)

**Status**: DONE

## Follow-up (2026-09-26): `/actions/filters` migration
Backend closed both contract gaps flagged below (§ Concerns 1–2 in the
original report). Adapted the mobile side:

- Deleted `src/hooks/use-action-assignees-query.ts` (+test) and
  `use-meeting-filter-options-query.ts` (+test); deleted `listActionAssignees`
  from `src/api/actions.ts`.
- Added `getActionFilters` (`src/api/actions.ts`) and
  `useActionFiltersQuery` (`src/hooks/use-action-filters-query.ts`, 16 lines)
  for `GET /actions/filters` → `{ open_total, assignees, meetings }`.
- `use-action-mutations.ts`: invalidation now targets `ACTION_FILTERS_QUERY_KEY`
  (`['action-filters']`) instead of the removed assignees key.
- `app/(app)/actions.tsx`: assignee and meeting chips now both come from the
  one `useActionFiltersQuery()` call instead of two separate queries.
- `app/(app)/(tabs)/index.tsx`: Home's "Việc cần làm · N đang mở" now reads
  `open_total` directly — no more summing per-assignee counts, so unassigned
  open items are no longer under-counted (Concern 2 from the original report
  is resolved).
- Updated all affected tests (`actions.test.ts`, `use-action-mutations.test.tsx`,
  `actions-screen.test.tsx`, `home-screen.test.tsx`) and added
  `use-action-filters-query.test.tsx` (hook test, unmounts in `afterEach`).

**Checks after the follow-up**: `yarn workspace @meetio/mobile test` → 985
passing, 0 failing, 181 suites (one unrelated pre-existing flake in
`use-search-query.test.tsx` reproduced once, then passed clean on rerun in
isolation — not touched by this change, not present in the final full run).
Typecheck clean, `npx eslint --max-warnings=0 apps/mobile` clean.

## Scope
`apps/mobile/**` only, coded against the already-built `@meetio/shared` contract
(`actions.types.ts`, `MeetingDetailResponse`/`MeetingActionItem` additions).
Backend (`apps/api`) is being built in parallel and was not touched or
required — every network call is mocked in tests via `apiClient`/hook mocks,
matching the existing pattern (`src/api/entities.test.ts`, etc.).

## Files created
- `src/utils/action-item-format.ts` (+63) / `.test.ts` — `DD/MM` display,
  `DD/MM/YYYY` edit-field format, and a validating parser back to `YYYY-MM-DD`.
- `src/api/actions.ts` (+61) / `.test.ts` — `getMeetingActions`, `listActions`,
  `listActionAssignees`, `createActionItem`, `updateActionItem`, `deleteActionItem`.
- `src/hooks/use-meeting-actions-query.ts` (+16) / `.test.tsx`
- `src/hooks/use-action-mutations.ts` (+53) / `.test.tsx` — create/update/delete,
  each invalidating meeting detail, meeting-actions, the cross-meeting actions
  list, and the assignees cache. Update reads `meeting_id` off the PATCH
  response; delete takes it from mutation variables (DELETE returns no body).
- `src/hooks/use-actions-list-query.ts` (+29) / `.test.tsx` — paged `GET /actions`.
- `src/hooks/use-action-assignees-query.ts` (+13) / `.test.tsx`
- `src/hooks/use-meeting-filter-options-query.ts` (+21) / `.test.tsx` — reuses
  `listMeetings` for the "Việc cần làm" meeting filter chips (no dedicated
  endpoint exists for "meetings with action items"; documented as a deliberate
  choice in the file's own doc comment).
- `src/components/meeting-detail/summary-citation-row.tsx` (+31) / test
- `src/components/meeting-detail/action-item-edit-sheet.tsx` (+148) / test —
  add/edit form (content, assignee, due date), inline error on a malformed date.
- `src/components/meeting-detail/assignee-picker-sheet.tsx` (+98) / test —
  reuses `useInfiniteEntitiesQuery({type:'person'})`; "Không ai" always first.
- `src/components/meeting-detail/action-items-tab.tsx` (+93) / test — owns the
  query, all three mutations, and the add/edit sheet's open state for the
  meeting-detail screen's Action Items tab.
- `src/components/action-item-row.tsx` (+59) / test — cross-meeting row (meeting
  title + date, tick, tap to open that meeting).
- `src/components/actions-list-header.tsx` (+58) / test — done-items toggle,
  assignee chips, meeting chips.
- `app/(app)/actions.tsx` (+134) / test (`src/components/actions-screen.test.tsx`)
  — the new "Việc cần làm" screen: infinite scroll via `next_offset`, open-first
  default with a toggle for done, assignee/meeting filter chips.

## Files modified
- `src/components/meeting-detail/meeting-summary-section.tsx` (rewrite, 75
  lines) / test — three states in precedence order: `summary === null` →
  "chưa có tóm tắt"; `insufficient` → the model's sentence as plain notice, no
  bullets; else points/decisions as separate tappable lists, plus an "đang cập
  nhật" label when `has_unprocessed_edits`.
- `src/components/meeting-detail/action-item-card.tsx` (rewrite, 85 lines) /
  test — now takes a real `MeetingActionItem`; meta line only ever shows the
  parts that are actually set (never a guessed placeholder); edit/delete icons;
  body tap opens the transcript at `segment_seq` when one exists.
- `src/components/meeting-detail/action-items-section.tsx` (rewrite, 52 lines)
  / test — trusts server ordering (open-first/done-last is the endpoint's own
  contract), adds "Thêm việc".
- `app/(app)/meeting-detail.tsx` — swapped the mock-mapped summary/action-items
  block for real `MeetingSummarySection` props and `<ActionItemsTab>`; tabs now
  genuinely swap content (previously Action Items rendered regardless of the
  active tab — fixed as part of this rewrite); added `handleOpenTranscript`
  pushing `{id, seq}`.
- `app/(app)/(tabs)/index.tsx` — new secondary row "Việc cần làm · N đang mở"
  (`N` = sum of `ActionAssignee.open_count`, the approximation the
  clarification explicitly allows), routes to `ACTIONS_ROUTE`.
- `src/navigation/app-routes.ts` — added `ACTIONS_ROUTE`.
- `src/components/icons/app-icon.tsx` — added `plus`, `chevronDown` (needed for
  "Thêm việc" and, held in reserve, a future disclosure control).
- `src/components/home/home-screen.test.tsx` — mocked the new assignees hook;
  updated two button-index assertions that shifted because of the new row,
  and added two tests for it.
- `src/components/meeting-detail/meeting-detail-screen.test.tsx` — rewritten
  around the new contract fields and the `ActionItemsTab` stub; added a
  citation-tap-to-transcript test.
- `src/mocks/index.ts`, `src/mocks/types.ts`, `src/mocks/mocks.test.ts` —
  dropped the retired `MeetingSummary`/`ActionItem` fixture (no production
  code referenced it any more after the rewrite).

## Files deleted
- `src/mocks/meeting-detail.mock.ts`, `src/utils/meeting-detail-mappers.ts` +
  its test — superseded by real API-shaped rendering; confirmed via grep that
  no remaining source references them.

## Checks
- Typecheck: clean (`yarn workspace @meetio/mobile typecheck`, exit 0).
- Unit tests: **986 passing, 0 failing**, 182 suites (`yarn workspace
  @meetio/mobile test`).
- Lint: clean (`npx eslint --max-warnings=0 apps/mobile`, exit 0).

## Acceptance criteria
- [x] Tóm tắt tab: real data, points/decisions as separate tappable lists,
      insufficient shown as plain notice, "đang cập nhật" label, chưa-có state.
- [x] Action Items tab: tick (PATCH), done sinks to bottom (server contract),
      edit content/assignee/due date, add manual item, delete with confirm
      (`Alert.alert`), assignee_name/due shown blank-when-null, tap opens
      transcript at `segment_seq`.
- [x] "Việc cần làm" screen: open-by-default + done toggle, assignee/meeting
      chips, infinite scroll by `next_offset`, row shows meeting + opens it,
      tick works there too.
- [x] Home: one secondary row, tab bar unchanged.
- [x] Invalidation: meeting detail, meeting-actions, actions list, assignees —
      all covered by `use-action-mutations.ts`, asserted in its tests.
- [x] Mocks removed from production paths (kept `useInfiniteEntitiesQuery`
      person search, which is real API, not fixture).
- [x] Vietnamese copy, existing visual language (`SurfaceCard`, `typography`,
      `colors`), kebab-case files, every new/changed file ≤ 171 lines.
- [x] Tests unmount hook-test harnesses in `afterEach` (the five new
      `use-*` hook test files) per the flake note in the task brief.

## Concerns / deviations
1. **Meeting filter chips have no dedicated endpoint.** The contract lists no
   "meetings with action items" endpoint, so `use-meeting-filter-options-query.ts`
   reuses `GET /meetings?limit=20`. This covers the common case (filtering
   among recent meetings) but a meeting outside that first page can't be
   selected as a filter. Flagging as a real gap in the contract rather than
   quietly working around it — if the backend adds a proper endpoint later,
   this hook is the only place to change.
2. **Home's open-count is an approximation**, per the task's own allowance
   ("N = sum of open_count, or a lightweight count from the list"): it sums
   `ActionAssignee.open_count`, which under-counts open items with no assignee
   (they never appear in the assignees list at all). Chose this over a second
   list request purely for the count, per YAGNI — flagging so it's a known,
   not accidental, limitation.
3. **Fixed a latent bug while rewriting the tab content**: the previous
   `meeting-detail.tsx` rendered `ActionItemsSection` unconditionally whenever
   the meeting was ready, regardless of which content tab was active (only the
   summary section was actually tab-gated). Now both are properly gated on
   `activeContentTab`, matching the "content tabs swap in place" design intent
   already stated in the file's own doc comment. This is a behavior change
   from what shipped before Phase 14; call out in review if unintended.
