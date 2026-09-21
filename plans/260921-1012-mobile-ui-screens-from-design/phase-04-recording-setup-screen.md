# Phase 04 — Recording settings (screen 05)

**Design crop:** `design/screen-05-cai-dat-ghi-am.png`
**File ownership:** `apps/mobile/app/(app)/recording-setup.tsx`, `apps/mobile/src/components/recording-setup/**`

## Context Links

- Crop: `design/screen-05-cai-dat-ghi-am.png`
- `clarifications.md` §5 — chain position: Home → **05** → 06 → 07 → 08
- P01 primitives: `ScreenHeader`, `SettingsRow`, `SurfaceCard`, `SectionHeading`, `AppIcon`
- P02 fixtures: `recording-options.mock.ts`
- Existing precedent for a stacked screen with a back chevron: `app/(app)/permission.tsx`

## Overview

- **Priority:** P2
- **Status:** completed
- The pre-flight sheet: audio source, language, translation toggle, quality. Local component
  state only — nothing persists, nothing is sent anywhere.

## Key Insights

1. **Selection state is local and deliberately throwaway.** Persisting it would mean touching
   `device-preferences.ts`, which is outside this commission's UI-only scope and outside this
   phase's ownership. `useState`, reset on unmount.
2. **The design shows two affordances on the selected radio row** — the filled radio on the left
   *and* a small orange dot on the right. Reproduce both; they are drawn, not an artefact.
3. **The "Dịch thuật" toggle gates the row beneath it.** The design shows the toggle on and the
   row active. When off, dim the "Dịch sang Tiếng Anh" row rather than hiding it — hiding it
   makes the layout jump, which the design gives no evidence for.
4. **The three chevron rows open nothing in this design sheet.** No picker screen exists in the
   crops. Cycle through the fixture's options in place on tap: the tap does something visible,
   and no undesigned screen gets invented. Report this choice.
5. This is the first screen in the chain, so its "Bắt đầu" button is what makes the whole
   recording flow reachable — P13's tap audit starts here.

## Requirements

**Functional**
- Back chevron → `router.back()` to Home.
- "Nguồn âm thanh" card: two radio rows, divider between, exactly one selected.
- "Ngôn ngữ" row, "Dịch thuật" toggle + target row, "Chế độ ghi âm" row.
- "Bắt đầu" → the live recording screen.

**Non-functional**
- No tab bar (stacked route, outside `(tabs)`).
- Under 200 lines per file; test per component.

## Architecture

```
recording-setup.tsx  (owns all useState + the two router calls)
├── ScreenHeader                       (P01)
├── AudioSourceCard  ← recording-options.mock.audioSources
├── SettingsSelectRow ×3               (wraps P01 SettingsRow)
├── TranslationToggleSection
└── PrimaryButton "Bắt đầu"            (existing)
```

State: `{ sourceId, languageId, translationEnabled, targetLanguageId, qualityId }` — one
`useState` object in the screen, setters passed down. No context, no store.

## Related Code Files

**Create:** `app/(app)/recording-setup.tsx`, `src/components/recording-setup/audio-source-card.tsx`,
`radio-row.tsx`, `translation-toggle-section.tsx`, `settings-select-row.tsx`, + a test beside each
**Modify:** none · **Delete:** none

## Implementation Steps

1. Read the crop; sample the card radius, the radio diameter, the divider inset.
2. Build `RadioRow` (selected / unselected, with the right-hand dot on selected).
3. Build `AudioSourceCard` wrapping two `RadioRow`s with a single inset divider.
4. Build `TranslationToggleSection` — `Switch` tinted to `colors.primary`, plus the dimmed-when-off
   target row.
5. Assemble `recording-setup.tsx`, wire "Bắt đầu" → `APP_ROUTES.recordingLive`.
6. Tests: selecting the second source moves the radio; the toggle dims/undims the target row;
   tapping a chevron row advances the displayed option; "Bắt đầu" pushes the live route.

## Todo List

- [ ] Crop read; radii and spacing measured
- [ ] Radio selection is single-choice and visibly exclusive
- [ ] Translation toggle dims the target row when off
- [ ] Chevron rows cycle options in place
- [ ] Back chevron and "Bắt đầu" both navigate
- [ ] No tab bar on this route
- [ ] typecheck + tests green

## Success Criteria

- Matches the crop side by side.
- Every control on screen responds visibly to a tap.
- Navigating away and back resets to the fixture defaults (state is local by design).

## Risk Assessment

| Risk | Likelihood | Impact | Countermeasure |
|---|---|---|---|
| Tab bar leaks onto this screen | Low | Medium | Route lives outside `(tabs)`; a test asserts the file path, simulator check confirms |
| Chevron rows read as broken because no picker opens | Medium | Low | In-place cycling gives visible feedback; reported to P13 |
| `Switch` platform tint ignores `colors.primary` on Android | Medium | Low | Set both `trackColor` and `thumbColor`; verify on both simulators |
| Local-only state is mistaken for a bug later | Low | Low | File-header comment stating it is intentional for the UI-only phase |

## Security Considerations

- No microphone is acquired here. The real permission gate is `app/(app)/permission.tsx` and the
  boot resolver, both untouched — this screen must not call any permission API, because doing so
  would move a permission prompt to a place the guard does not expect.

## Next Steps

- Depends on: P01, P02. Parallel with: P03, P05–P12.
- Report to P13: the chevron rows cycle rather than open a picker.
