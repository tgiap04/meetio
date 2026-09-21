# Phase 03 — Home tab (screen 04)

**Design crop:** `design/screen-04-trang-chu.png`
**File ownership:** `apps/mobile/app/(app)/(tabs)/index.tsx`, `apps/mobile/src/components/home/**`

## Context Links

- Crop: `design/screen-04-trang-chu.png`
- `clarifications.md` §2 — keep the existing `/me` logic, restyle only
- Existing screen (moved into `(tabs)/` by P01): currently `useMeQuery` + `LoadingState` /
  `ErrorState` + consent gate to `/(app)/consent`
- P01 primitives: `MeetingListRow`, `StatusBadge`, `SectionHeading`, `InitialsAvatar`, `AppIcon`
- P02 fixtures: `meetings.mock.ts`

## Overview

- **Priority:** P1 — the entry point for the whole recording chain.
- **Status:** completed
- Restyle the home screen to the design while keeping every line of working API behaviour.

## Key Insights

1. **This screen has real logic and must keep it.** `useMeQuery`, the pending and error branches,
   and the consent gate (`recording_consent_at` → `/(app)/consent`) all survive. The greeting
   name comes from `meQuery.data.user.display_name`, not from a fixture.
2. **The consent gate now sits behind the design's big CTA.** Today's "Bắt đầu" button becomes
   "Bắt đầu ghi âm / Từ thiết bị này". Without consent it still routes to `/(app)/consent`;
   with consent it routes to the recording-setup screen instead of raising the Phase-07 `Alert`.
   That `Alert` is removed — this plan is what it was waiting for.
3. **The crown badge has no destination anywhere in the design.** Making one up is out of scope.
   Render it as a non-interactive decorative element with an `accessibilityLabel`, and say so in
   the hand-back. A tap that goes nowhere is worse than a control that does not look tappable.
4. **Recent meetings are mock, the user is real.** That mix is exactly what `clarifications.md` §2
   asks for, and it is worth a comment at the top of the file so the next reader is not confused.
5. Two secondary rows — "Nhập từ file âm thanh", "Kết nối thiết bị khác" — have no destination
   either. Same treatment: visible, labelled, inert, reported.

## Requirements

**Functional**
- Header: app mark, "Meetio" wordmark, crown badge.
- Greeting `Chào buổi sáng, {display_name} 👋` over the design's subtitle paragraph.
- Primary CTA card → recording setup (or consent, if absent).
- Two secondary action rows (inert this phase).
- "Cuộc họp gần đây" heading + "Xem tất cả" → Thư viện tab.
- Three meeting rows from fixtures → meeting detail, carrying the meeting id.
- Loading and error states preserved.

**Non-functional**
- Under 200 lines per file; the screen file stays thin and delegates to `src/components/home/`.
- Test file per component plus a screen test covering pending / error / loaded.

## Architecture

```
useMeQuery ─┬─ isPending ─→ <LoadingState/>          (unchanged)
            ├─ isError   ─→ <ErrorState onRetry/>    (unchanged)
            └─ data ─────→ HomeContent
                             ├── HomeHeader          (display_name)
                             ├── StartRecordingCard  (hasConsent → route choice)
                             ├── SecondaryActionRow ×2
                             └── RecentMeetingsSection ← meetings.mock
```

Routing decisions live in `index.tsx`; the components below it take `onPress` callbacks.

## Related Code Files

**Modify:** `apps/mobile/app/(app)/(tabs)/index.tsx` (moved here by P01)
**Create:** `src/components/home/home-header.tsx`, `start-recording-card.tsx`,
`secondary-action-row.tsx`, `recent-meetings-section.tsx`, plus a test beside each
**Delete:** none

## Implementation Steps

1. Read the crop. Measure spacing, radii and type sizes against it — no guessed values.
2. Build the four components against P01 primitives and P02 fixtures.
3. Rewrite `index.tsx`: keep `useMeQuery` and both early returns verbatim; replace only the
   rendered body.
4. Replace the `Alert.alert('Ghi âm', …Phase 07…)` branch with
   `router.push(APP_ROUTES.recordingSetup)`.
5. Wire "Xem tất cả" → the Thư viện tab, and each meeting row → meeting detail with `?id=`.
6. Tests: pending renders `LoadingState`; error renders `ErrorState`; loaded renders the greeting
   with the mocked display name and all three meeting titles; CTA without consent routes to
   consent; CTA with consent routes to recording setup.

## Todo List

- [ ] Crop read; no invented visual values
- [ ] Four components + tests
- [ ] `useMeQuery` pending/error branches untouched
- [ ] Phase-07 `Alert` removed, replaced by a real route
- [ ] Consent gate still enforced
- [ ] "Xem tất cả" and meeting rows navigate
- [ ] Crown + two secondary rows inert and reported
- [ ] typecheck + tests green

## Success Criteria

- Screen matches the crop side by side on a simulator.
- Tapping the CTA without consent reaches the consent screen; with consent, reaches screen 05.
- Tapping any meeting row reaches screen 08 with that meeting's id in the URL.
- No regression in `/me` handling: both early-return branches still covered by tests.

## Risk Assessment

| Risk | Likelihood | Impact | Countermeasure |
|---|---|---|---|
| Restyling silently drops the consent gate | Medium | High — a legal gate (US-04) disappears | A test asserts the no-consent path routes to `/(app)/consent`; call it out in review |
| Greeting is hardcoded instead of read from `/me` | Medium | Medium | Screen test mocks `useMeQuery` with a distinctive name and asserts it renders |
| Screen file grows past 200 lines | Medium | Low | Four extracted components are already scoped |
| Inert crown reads as broken | Low | Low | No `Pressable`, no press feedback, `accessibilityRole` omitted |

## Security Considerations

- `display_name` is rendered as text inside `<Text>`; React Native does not interpret markup, so
  there is no injection surface.
- The consent gate is a legal control, not a UI nicety — losing it in a restyle is the single
  security-relevant failure mode of this phase.

## Next Steps

- Depends on: P01, P02.
- Report to P13: the crown and the two secondary rows are dead taps by design, plus the route
  constant used for the CTA.
