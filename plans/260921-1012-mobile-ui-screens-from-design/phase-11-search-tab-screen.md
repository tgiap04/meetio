# Phase 11 — Search tab (screen 13)

**Design crop:** `design/screen-13-tim-kiem.png`
**File ownership:** `apps/mobile/app/(app)/(tabs)/search.tsx`, `apps/mobile/src/components/search/**`

## Context Links

- Crop: `design/screen-13-tim-kiem.png`
- P01 primitives: `SearchField`, `FilterChipRow`, `MeetingListRow`, `SectionHeading`,
  `StatusBadge`, `InitialsAvatar`, `SurfaceCard`
- P02 fixtures: `search-results.mock.ts`
- P01 created a stub at this path; this phase replaces its body.

## Overview

- **Priority:** P2
- **Status:** completed
- Cross-entity search results in three grouped sections, with a kind filter.

## Key Insights

1. **Three result kinds with three different row shapes.** Meetings show duration · date plus a
   highlighted snippet and a status badge; documents show a "Liên quan:" line and a badge; people
   show an avatar and "Xuất hiện trong N cuộc họp" with no badge. One row component with a
   discriminated union on `kind` — not three components, and not one component with five
   optional props.
2. **"Cuộc họp (3)" with two rows drawn is a design inconsistency.** The count comes from
   `items.length` so the heading can never lie. P02 carries three meetings in that group with the
   third marked `// INFERRED:`.
3. **The chips filter by kind** (Tất cả / Transcript / Node / Meeting), which does **not** map
   cleanly onto the three section kinds (Cuộc họp / Tài liệu / Người). This is a real gap in the
   design. Resolve by mapping: Meeting → the Cuộc họp group, Transcript → Tài liệu, Node → Người,
   Tất cả → all three. State the mapping in a code comment and in the hand-back rather than
   letting a reader guess.
4. **The search placeholder does not resolve in the crop.** P02 marks it `// LOW CONFIDENCE:`.
   Use P02's transcription; do not write a nicer one.
5. **This is a tab root: no back chevron**, tab bar visible. Same rule as P10.
6. **Results are shown unconditionally**, exactly as the crop draws them — there is no empty
   "start typing" state in the design. Typing narrows the existing results; clearing restores
   them.

## Requirements

**Functional**
- Header "Tìm kiếm", no back chevron, tab bar visible.
- Search field + funnel button (funnel inert, reported).
- Four kind chips, one active.
- Three result sections with counts derived from the data.
- Meeting and document rows → meeting detail. Person rows are inert (the design defines no person
  screen) — reported.

**Non-functional**
- Under 200 lines per file; test per component.

## Architecture

```
search.tsx
├── SearchHeader ("Tìm kiếm")
├── SearchField (P01) ──► query
├── FilterChipRow (P01) ──► kindFilter
└── SearchResultSection ×n   ← search-results.mock, filtered by kind then by query
      └── SearchResultRow (discriminated on item.kind)
```

## Related Code Files

**Modify:** `app/(app)/(tabs)/search.tsx` (stub from P01)
**Create:** `src/components/search/search-header.tsx`, `search-result-section.tsx`,
`search-result-row.tsx`, + a test beside each
**Delete:** none

## Implementation Steps

1. Read the crop; measure the row heights for all three kinds — they differ.
2. Build `SearchResultRow` with a `switch` over `item.kind`; TypeScript's exhaustiveness check
   is what keeps a fourth kind from being silently dropped later.
3. Build `SearchResultSection` with a derived count in its heading.
4. Assemble `search.tsx` with the chip→group mapping from Key Insight 3, documented in place.
5. Tests: all three sections render under "Tất cả"; the Meeting chip leaves only the Cuộc họp
   section; the heading count matches the rendered row count in every filter state; a query
   narrows rows; a meeting row pushes detail; a person row does not navigate.

## Todo List

- [ ] Crop read; three distinct row heights measured
- [ ] One row component, discriminated union, exhaustive `switch`
- [ ] Section counts derived from `.length`, never literal
- [ ] Chip→group mapping documented in code
- [ ] P02's placeholder used verbatim, not improved
- [ ] No back chevron; tab bar visible
- [ ] typecheck + tests green

## Success Criteria

- Matches the crop side by side, with the count corrected to match the rows shown.
- Every chip changes the visible sections.
- A test asserts heading count == rendered row count across all four chip states — the direct
  guard against the defect the design shipped.

## Risk Assessment

| Risk | Likelihood | Impact | Countermeasure |
|---|---|---|---|
| Section counts hardcoded, reproducing the design's own bug | High | Low | Derived from `.length`, asserted in every filter state |
| Chip→group mapping invented differently by reviewer and implementer | High | Medium — screen behaves unexplainably | Mapping fixed here, in a code comment, and in the hand-back |
| Three row components instead of one | Medium | Low | Discriminated union stated as the design |
| Person row looks tappable but is not | Medium | Low | No press feedback; reported to P13 |

## Security Considerations

- Search runs entirely over in-memory fixtures. No query string leaves the device, so there is no
  query-logging or leakage surface in this phase. When a real search endpoint arrives, the query
  becomes user content crossing the network — worth noting now, not building now.

## Next Steps

- Depends on: P01, P02. Parallel with: P03–P10, P12.
- Report to P13: the chip→group mapping, the inert funnel and person rows.
