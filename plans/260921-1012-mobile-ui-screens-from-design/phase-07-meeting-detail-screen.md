# Phase 07 — Meeting detail (screen 08)

**Design crop:** `design/screen-08-tong-quan-cuoc-hop.png`
**File ownership:** `apps/mobile/app/(app)/meeting-detail.tsx`, `apps/mobile/src/components/meeting-detail/**`

## Context Links

- Crop: `design/screen-08-tong-quan-cuoc-hop.png`
- `clarifications.md` §6 — screens 9 and 10 are **separate routes**, opened from this screen's tabs
- P01 primitives: `ScreenHeader`, `SegmentedTabs`, `StatusBadge`, `SectionHeading`, `SurfaceCard`, `AppIcon`
- P02 fixtures: `meetings.mock.ts`, `meeting-detail.mock.ts`

## Overview

- **Priority:** P1 — the hub the whole navigation graph converges on.
- **Status:** completed
- Meeting hero plus a four-tab row where **two tabs show content and two tabs navigate away**.

## Key Insights

1. **The tab row is heterogeneous, and that is the crux of this phase.** Tóm tắt and Action Items
   swap content in place; Transcript and Graph push new routes (per `clarifications.md` §6, the
   design draws each with its own header and back chevron). `SegmentedTabs` therefore cannot own
   the behaviour — the screen maps each tab index to either a content key or a route.
2. **Returning from screens 9/10 must land back on a sensible tab.** If the active tab is left as
   "Transcript" when the user pops back, the screen shows nothing. Keep the active tab on the
   last *content* tab and treat the navigating tabs as momentary. Test this explicitly.
3. **Content for both content-tabs is visible simultaneously in the crop.** The design shows
   "Tóm tắt nội dung" *and* "Action Items" on one scroll under the Tóm tắt tab. So the Tóm tắt
   tab renders both sections; the Action Items tab renders the action-item section alone.
4. **Route shape is flat with a query param** — `/(app)/meeting-detail?id=…` rather than
   `meeting/[id].tsx`. Reason: a `[id]` directory would be co-owned by P07, P08 and P09, which
   breaks the parallel-phase file-ownership rule. Promoting to a dynamic segment later is a
   rename, not a redesign.
5. **The kebab (⋮) has no menu in the design.** Inert, labelled, reported — same rule as the crown
   on screen 04.
6. **Action-item checkboxes are drawn empty.** Make them tappable and locally toggleable: it is
   a visible response to a tap and it invents no data.

## Requirements

**Functional**
- Header: back chevron, "Chi tiết cuộc họp", inert kebab.
- Hero: calendar tile, title, "12/05/2025 · 42 phút", `Đã xử lý` badge — resolved from the `?id=`
  param against the fixtures, falling back to the first meeting if the id is unknown.
- Four tabs; two switch content, two navigate (carrying the same `?id=`).
- Summary paragraph + three action-item cards with toggleable checkboxes.

**Non-functional**
- Under 200 lines per file; test per component.
- Unknown or missing `?id=` must not crash.

## Architecture

```
meeting-detail.tsx
├── useLocalSearchParams<{ id?: string }>  → lookup in meetings.mock (fallback: first)
├── ScreenHeader (back + inert kebab)
├── MeetingHero            (tile, title, meta, badge)
├── SegmentedTabs (P01, 4 items, controlled)
│     onSelect(index):
│       0,1 → setActiveContentTab(index)
│       2   → router.push(transcript?id=)
│       3   → router.push(graph?id=)
└── content: <MeetingSummarySection/> + <ActionItemsSection/>   (tab 0)
            <ActionItemsSection/>                                (tab 1)
```

## Related Code Files

**Create:** `app/(app)/meeting-detail.tsx`, `src/components/meeting-detail/meeting-hero.tsx`,
`meeting-summary-section.tsx`, `action-items-section.tsx`, `action-item-card.tsx`, + a test beside each
**Modify:** none · **Delete:** none

## Implementation Steps

1. Read the crop; measure the tile radius, the tab underline weight, the card insets.
2. Resolve the meeting from `useLocalSearchParams`, with a documented fallback.
3. Build the hero, summary section, and action-item card with a local `Set<string>` of checked ids.
4. Wire `SegmentedTabs` with the split behaviour and keep the active index on content tabs only.
5. Tests: an unknown `?id=` renders the fallback meeting rather than throwing; tapping Transcript
   pushes the transcript route with the id; tapping Graph pushes the graph route with the id;
   tapping Transcript then popping back leaves a content tab active; a checkbox toggles.

## Todo List

- [ ] Crop read; no invented visual values
- [ ] Meeting resolved from `?id=`, unknown id handled
- [ ] Tabs 0/1 switch content, tabs 2/3 navigate with the id
- [ ] Active tab never left on a navigating tab
- [ ] Checkboxes toggle locally
- [ ] Kebab inert and reported
- [ ] typecheck + tests green

## Success Criteria

- Matches the crop side by side.
- From Home, tapping Sprint Review shows Sprint Review — not a hardcoded meeting.
- Transcript and Graph tabs reach screens 9 and 10 and come back to a rendered screen.

## Risk Assessment

| Risk | Likelihood | Impact | Countermeasure |
|---|---|---|---|
| Popping back from screen 9/10 leaves a blank tab | High | Medium — looks broken, easy to miss | Active index restricted to content tabs; dedicated test |
| A `[id]` directory is used instead of the flat route | Medium | Medium — file-ownership collision with P08/P09 | Route path stated here and in `app-routes.ts` (P01-owned) |
| Unknown `?id=` throws on an undefined lookup | Medium | Medium | Explicit fallback + test |
| Tab row grows a third behaviour later | Low | Low | The index→action map is one small function, easy to extend |

## Security Considerations

- `?id=` is read from the URL and used only as a lookup key against a frozen in-memory array. It
  is never interpolated into a request, a path, or a query. Keep it that way when real data
  arrives — this is the point where an unvalidated id would become an IDOR.

## Next Steps

- Depends on: P01, P02. Parallel with: P03–P06, P08–P12.
- Report to P13: the exact query-param contract screens 9 and 10 must accept.
