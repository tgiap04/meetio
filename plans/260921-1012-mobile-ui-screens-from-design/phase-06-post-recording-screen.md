# Phase 06 — Post-recording status (screen 07)

**Design crop:** `design/screen-07-sau-khi-ghi-am.png`
**File ownership:** `apps/mobile/app/(app)/recording-done.tsx`, `apps/mobile/src/components/recording-done/**`

## Context Links

- Crop: `design/screen-07-sau-khi-ghi-am.png`
- `clarifications.md` §5 — chain: 06 → **07** → 08
- P01 primitives: `ScreenHeader`, `StatusBadge`, `SecondaryButton`, `SurfaceCard`, `AppIcon`
- P01 tokens: `warning` / `warningTint` (the "Đang xử lý" pill), `success` / `successTint`

## Overview

- **Priority:** P2
- **Status:** completed
- The confirmation and pipeline-progress screen. Four processing stages in four different
  states — the screen that exercises every status token this plan adds.

## Key Insights

1. **Four distinct row states, not two.** Transcript and Embedding are `Hoàn thành` (green check,
   green muted text); Knowledge Graph is `Đang xử lý` (orange filled icon, amber pill, chevron);
   Tóm tắt & Action Items is `Chờ xử lý` (orange *outline* icon, plain muted text). The badge
   appears on one row only — the other three use plain right-aligned text. Reproduce that
   asymmetry; it is drawn deliberately.
2. **Only the Knowledge Graph row has a chevron**, and it is the one row that navigates — to
   screen 10. That is the design's own affordance and the reason it carries the badge.
3. **The hero check circle reuses the halo technique** from screen 06's pause button: a larger
   `primaryTint` circle behind a `primary` circle. If P05 and P06 both need it, neither owns it —
   each builds its own local version rather than reaching into the other's directory, or P13
   promotes it into `src/components/ui/` afterwards. Do not create a shared file mid-parallel.
4. **"Xem chi tiết tiến trình" is an outline button** — the first and only use of
   `SecondaryButton` in the whole design. It routes to screen 08.
5. The static "42 phút 18 giây" and "1.284 từ" come from the crop verbatim. They do not have to
   agree with the Sprint Review fixture's 42 phút — and they happen to. Leave it.

## Requirements

**Functional**
- Back chevron → back to the live screen.
- Hero: haloed check circle, "Đã ghi âm xong!", duration, word count.
- AI-processing notice card (peach) with its sparkle icon and body copy.
- Four progress rows in their four states, with dividers.
- Knowledge Graph row → screen 10. "Xem chi tiết tiến trình" → screen 08.

**Non-functional**
- Under 200 lines per file; test per component.
- Nothing animated, nothing polling — the states are static.

## Architecture

```
recording-done.tsx
├── ScreenHeader (back only, no title)
├── RecordingDoneHero      (halo circle + three lines)
├── AiProcessingNotice     (peach card)
├── ProcessingStepRow ×4   (state: 'done' | 'active' | 'pending')
└── SecondaryButton        (P01) → APP_ROUTES.meetingDetail
```

`ProcessingStepRow` takes `{ label, state, onPress? }`. The badge renders only when
`state === 'active'`; `onPress` present is what draws the chevron.

## Related Code Files

**Create:** `app/(app)/recording-done.tsx`, `src/components/recording-done/recording-done-hero.tsx`,
`ai-processing-notice.tsx`, `processing-step-row.tsx`, + a test beside each
**Modify:** none · **Delete:** none

## Implementation Steps

1. Read the crop; sample the peach card's fill against `primaryTint` and the pill against
   `warningTint` — confirm they differ before assuming one token covers both.
2. `RecordingDoneHero` with the two-circle halo.
3. `AiProcessingNotice` — orange heading, muted three-line body, all copy verbatim.
4. `ProcessingStepRow` covering all three states in one component.
5. Assemble and wire both navigations.
6. Tests: each of the three row states renders its expected icon/text combination; the badge
   appears on exactly one row; the graph row pushes the graph route; the button pushes detail.

## Todo List

- [ ] Crop read; peach card vs pill fills compared, not assumed equal
- [ ] Halo circle matches screen 06's technique
- [ ] All four rows in their correct distinct states
- [ ] Exactly one badge, exactly one chevron
- [ ] Both navigations wired
- [ ] typecheck + tests green

## Success Criteria

- Matches the crop side by side.
- The Knowledge Graph row reaches screen 10; the outline button reaches screen 08.
- `warning` / `warningTint` render at the contrast the P01 test asserted.

## Risk Assessment

| Risk | Likelihood | Impact | Countermeasure |
|---|---|---|---|
| Halo circle duplicated across P05 and P06 in a shared file | Medium | Medium — file-ownership collision between parallel phases | Each phase builds a local copy; P13 promotes to `ui/` afterwards if worth it |
| `warningTint` and `primaryTint` assumed identical | Medium | Low | Step 1 compares them explicitly against the crop |
| All four rows collapse into two states | Medium | Low | Test asserts three distinct state renderings |
| Amber "Đang xử lý" text fails AA on its own pill | Medium | Low | Already covered by the P01 contrast row `warning` vs `warningTint` |

## Security Considerations

- The copy promises "chúng tôi sẽ thông báo khi hoàn tất" while nothing is processing and no
  notification will arrive. Harmless in a prototype, misleading in production — record it in the
  hand-back alongside P05's recording-indicator note.

## Next Steps

- Depends on: P01, P02. Parallel with: P03–P05, P07–P12.
- Report to P13: whether the halo circle should be promoted into `src/components/ui/`.
