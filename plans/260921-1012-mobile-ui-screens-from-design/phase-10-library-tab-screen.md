# Phase 10 — Library tab (screen 12)

**Design crop:** `design/screen-12-thu-vien.png`
**File ownership:** `apps/mobile/app/(app)/(tabs)/library.tsx`, `apps/mobile/src/components/library/**`

## Context Links

- Crop: `design/screen-12-thu-vien.png`
- `clarifications.md` §1 — **authoritative**: this is the Thư viện tab; header "Thư viện";
  first section "Gần đây"; second "Tuần trước"; bottom tab bar present; the "Hỏi đáp AI" text
  drawn in the crop is a designer copy-paste error. Screen 11 is out of scope.
- P01 primitives: `SearchField`, `FilterChipRow`, `MeetingListRow`, `SectionHeading`, `SurfaceCard`
- P02 fixtures: `meetings.mock.ts`
- P01 created a stub at this path; this phase replaces its body.

## Overview

- **Priority:** P2
- **Status:** completed
- The saved-meetings tab: search, status filter, two date-grouped sections of meeting rows.

## Key Insights

1. **Two strings in the crop are wrong and must not be copied.** The header reads "Hỏi đáp AI"
   and the search placeholder reads "Đặt câu hỏi về cuộc họp…" — both left over from an AI Q&A
   screen. The header is settled by `clarifications.md` as "Thư viện". The placeholder is *not*
   covered by the clarification; borrow screen 13's placeholder verbatim rather than writing a
   new one, so "no invented content" still holds. Flag the borrowing.
2. **No back chevron.** The crop draws one, but this is a tab root and Home has none. A back
   chevron on a tab root either does nothing or unwinds to a screen the user did not come from.
   Dropped — see `plan.md` conflict 3.
3. **Section membership is fixture-driven, not date-computed.** "Gần đây" holds Sprint Review and
   Client Discussion; "Tuần trước" holds Project Planning and Marketing Brief. Computing this
   from `date` against `Date.now()` would make the screen's content drift with the calendar and
   the tests flaky. Group by an explicit fixture field.
4. **The leading visual differs from Home.** Home uses a person avatar; Library uses a peach
   circle with an orange waveform glyph. That is `MeetingListRow`'s `leading="waveform"` variant,
   already owned by P01.
5. **The filter chips must actually filter.** Tất cả / Đã xử lý / Đang xử lý map straight onto
   `MeetingStatus`. Sections with no surviving rows should hide their heading rather than leave a
   heading over empty space.

## Requirements

**Functional**
- Header "Thư viện", no back chevron, bottom tab bar visible.
- Search field + funnel button (funnel inert, reported).
- Three status chips, one active, filtering both sections.
- "Gần đây" and "Tuần trước" sections of meeting rows.
- Every row → meeting detail with its `?id=`.

**Non-functional**
- Under 200 lines per file; test per component.

## Architecture

```
library.tsx
├── LibraryHeader ("Thư viện")
├── SearchField (P01) ──► query
├── FilterChipRow (P01) ──► status filter
└── LibrarySection ×2      ← meetings.mock grouped by `group` field
      └── MeetingListRow leading="waveform" → APP_ROUTES.meetingDetail?id=
```

Two pieces of state: `query`, `statusFilter`. Filtering is a single derived array; sections with
zero rows render nothing at all.

## Related Code Files

**Modify:** `app/(app)/(tabs)/library.tsx` (stub from P01)
**Create:** `src/components/library/library-header.tsx`, `library-section.tsx`, + a test beside each
**Delete:** none

## Implementation Steps

1. Read the crop; measure the row height, the circle tile diameter, the section spacing.
2. Confirm screen 13's placeholder string with P02, then reuse it.
3. Build `LibrarySection` — heading plus rows, rendering `null` when empty.
4. Assemble `library.tsx` with the two filters composed into one derived list.
5. Tests: the header reads "Thư viện" and never "Hỏi đáp AI"; all four meetings render under
   "Tất cả"; "Đang xử lý" leaves only Project Planning and hides the "Gần đây" heading; a search
   query narrows the rows; tapping a row pushes detail with the right id.

## Todo List

- [ ] Crop read; the two copy-paste strings NOT copied
- [ ] No back chevron; tab bar visible
- [ ] Sections grouped by fixture field, not by `Date.now()`
- [ ] `MeetingListRow leading="waveform"` reused from P01
- [ ] Chips and search both filter; empty sections hide their heading
- [ ] Rows navigate with the correct id
- [ ] typecheck + tests green

## Success Criteria

- Matches the crop side by side, **with the header and placeholder corrected** per the
  clarification.
- The tab bar is present and the Thư viện tab is shown active.
- A test explicitly asserts the header is not "Hỏi đáp AI" — the defect is documented enough that
  a regression deserves its own guard.

## Risk Assessment

| Risk | Likelihood | Impact | Countermeasure |
|---|---|---|---|
| The designer's wrong header is implemented verbatim | High | Medium — ships a wrong screen title | A test asserts the corrected string and the absence of the wrong one |
| Date grouping computed from `Date.now()` | Medium | Medium — tests rot, content drifts | Grouping field lives in the fixture |
| Back chevron added back "to match the design" | Medium | Low | Recorded in `plan.md` conflict 3 and in this phase |
| Empty section headings left hanging after filtering | Medium | Low | `null` render + test |

## Security Considerations

- None specific. No new data, no new permissions, no new network calls.

## Next Steps

- Depends on: P01, P02. Parallel with: P03–P09, P11, P12.
- Report to P13: the borrowed placeholder string and the inert funnel button.
