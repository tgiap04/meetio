# Phase 01 — Foundation: tab navigator, tokens, icons, shared primitives

**File ownership:** `apps/mobile/package.json`, `apps/mobile/src/theme/**`, `apps/mobile/app/(app)/(tabs)/_layout.tsx`, `apps/mobile/src/navigation/route-guards.ts`, `apps/mobile/src/navigation/bootstrap-route.ts`, `apps/mobile/src/navigation/app-routes.ts`, `apps/mobile/src/components/ui/**`, `apps/mobile/src/components/icons/**`

**Handover ownership** (this phase creates them, then never touches them again): `(tabs)/index.tsx` → P03,
`(tabs)/library.tsx` → P10, `(tabs)/search.tsx` → P11, `(tabs)/settings.tsx` → P12. P01 strictly precedes all
four, so there is no parallel collision — but this phase must land and be handed over before any of them starts.
`app/(app)/_layout.tsx` is owned by nobody: it is not edited by this plan at all.

## Context Links

- Design crops (style reference for every token and primitive): `design/screen-04-trang-chu.png`, `design/screen-05-cai-dat-ghi-am.png`, `design/screen-07-sau-khi-ghi-am.png`, `design/screen-10-knowledge-graph.png`, `design/screen-14-cai-dat.png`
- Settled decisions: `clarifications.md`
- Existing style precedent: `apps/mobile/src/components/illustrations/blob.tsx`, `arc.tsx`, `mic-glyph.tsx` — shapes drawn with `View` + `borderRadius` + `transform`, no SVG
- Guard test that must stay green: `apps/mobile/src/navigation/app-group-layout.test.tsx`

## Overview

- **Priority:** P1 — blocks phases 03–12 entirely.
- **Status:** completed
- Everything ten screens share, built once: the bottom tab navigator, the new colour tokens, the
  icon dependency and its facade, and thirteen presentational primitives.

## Key Insights

1. **`@expo/vector-icons` is genuinely absent.** Verified against the installed tree: not in
   `node_modules`, not in `expo@57`'s dependencies, not in `expo-router@57`'s. The common belief
   that it "ships with Expo" is false for this SDK. It must be installed explicitly. It is pure
   JS plus font files loaded through `expo-font` (already a dependency of `expo`), so there is no
   native module and no prebuild.
2. **Jest is already configured to transform it.** `transformIgnorePatterns` contains
   `@expo(nent)?/.*` in its negative lookahead, so `@expo/vector-icons` is transformed rather
   than skipped. **This is a prediction, not a fact** — see Step 1, which measures it before any
   dependent code is written. This repo has already lost a rework cycle to an assumed Jest mock
   (`expo-audio` / `jest-expo`).
3. **`colors.test.ts` constrains the shape of new tokens, not just their values.** The regex
   `/^[a-zA-Z]+:#[0-9A-F]{6}$/` runs over `Object.entries(colors)`. Therefore: no nested objects
   (entity colours must be flat keys), no digits or underscores in key names, and hex digits
   must be **uppercase**.
4. **`app/(app)/_layout.tsx` must keep rendering a `Stack`.** `app-group-layout.test.tsx` mocks
   `Stack` and asserts it is called once authenticated. Nesting a `(tabs)` group *inside* `(app)`
   satisfies both the design and that test with zero edits to the guard file.
5. **Two route-literal files are duplicated on purpose** (`route-guards.ts` /
   `bootstrap-route.ts`) so `bootstrap-route.ts` stays a zero-mock unit. Any change to
   `APP_HOME_ROUTE` must land in both.
6. **`react-native-svg` is not worth its price here.** `/ios` and `/android` are gitignored
   prebuild output; adding a native module makes every developer re-run prebuild + pod install
   for what is ten decorative icons and six graph edges. Rotated `View`s already do this job in
   `arc.tsx`.

## Requirements

**Functional**
- A bottom tab bar with four tabs — Trang chủ, Thư viện, Tìm kiếm, Cài đặt — visible on those
  four screens and absent from every stacked screen.
- `AppIcon`: a closed union of semantic icon names mapped to concrete glyphs in one file.
- Thirteen primitives, each consumable with primitive props only (no domain types — that is what
  keeps Phase 02 independent).
- New colour tokens for the amber "Đang xử lý" state, the pale-blue translation card, and the
  three knowledge-graph entity types.

**Non-functional**
- Every file under 200 lines.
- Every new token passes `colors.test.ts`, including new contrast rows measured against **both**
  `surface` and `background`.
- One test file per primitive, at the depth of `src/components/onboarding/onboarding-page.test.tsx`.
- `yarn workspace @meetio/mobile typecheck` and `test` both exit 0.

## Architecture

### Route tree after this phase

```
app/
├── _layout.tsx                    (unchanged — boot gate)
├── index.tsx                      (unchanged — resolveBootstrapRoute)
├── onboarding.tsx                 (unchanged)
├── (auth)/…                       (unchanged)
└── (app)/
    ├── _layout.tsx                (UNCHANGED — Stack + auth guard)
    ├── permission.tsx             (unchanged, stacked)
    ├── consent.tsx                (unchanged, stacked)
    └── (tabs)/
        ├── _layout.tsx            (NEW — Tabs)
        ├── index.tsx              (MOVED from (app)/index.tsx)
        ├── library.tsx            (NEW — stub, P10 fills it)
        ├── search.tsx             (NEW — stub, P11 fills it)
        └── settings.tsx           (MOVED from (app)/settings.tsx)
```

Group segments in parentheses do not appear in the URL, so `(app)/(tabs)/index.tsx` still resolves
at `/(app)`. **That is the one assumption in this phase that can bite** — Step 3 proves it.

### Data flow

Primitives are pure: `props in → elements out`. None of them import from `src/mocks/`, none hold
state, none call `router` directly — they take an `onPress` callback. Screen phases own the
routing decision; primitives own the pixels. That is what lets P03–P12 run in parallel without
sharing a file.

### New tokens

| Token | Purpose | Contrast rows to add to `colors.test.ts` |
|---|---|---|
| `warning` | "Đang xử lý" text, amber | vs `warningTint`, vs `surface`, vs `background` |
| `warningTint` | "Đang xử lý" badge fill | — |
| `translationTint` | pale blue card, screen 06 | — |
| `entityPersonText` / `entityPersonTint` | graph Person node | text vs tint, text vs `surface` |
| `entityTaskText` / `entityTaskTint` | graph Task node | text vs tint, text vs `surface` |
| `entityProjectText` / `entityProjectTint` | graph Project node | text vs tint, text vs `surface` |

Also add the missing row `success` vs `successTint` — the mint badge already ships and its text
contrast was never asserted.

## Related Code Files

**Modify**
- `apps/mobile/package.json` — add `@expo/vector-icons`; drop the dead `react-native-svg` entry from `transformIgnorePatterns`
- `apps/mobile/src/theme/colors.ts` — new tokens + doc comment replacing the "deliberately absent" note
- `apps/mobile/src/theme/colors.test.ts` — new contrast rows
- `apps/mobile/src/theme/typography.ts` — add `sectionTitle` (17/600) and `label` (15/600); the design uses weights `typography` does not yet carry
- `apps/mobile/src/navigation/route-guards.ts` and `bootstrap-route.ts` — only if Step 3 shows `/(app)` no longer resolves

**Create**
- `apps/mobile/app/(app)/(tabs)/_layout.tsx`
- `apps/mobile/app/(app)/(tabs)/library.tsx`, `search.tsx` (stubs)
- `apps/mobile/src/navigation/app-routes.ts` — every new route constant, one place
- `apps/mobile/src/components/icons/app-icon.tsx` (+ test)
- `apps/mobile/src/components/ui/screen-header.tsx` — back chevron, title, optional trailing slot
- `apps/mobile/src/components/ui/status-badge.tsx` — `done` | `processing` | `queued`
- `apps/mobile/src/components/ui/meeting-list-row.tsx` — `leading: 'avatar' | 'waveform'`, title, meta, badge, optional snippet
- `apps/mobile/src/components/ui/filter-chip-row.tsx`
- `apps/mobile/src/components/ui/search-field.tsx` — magnifier, placeholder, optional funnel button
- `apps/mobile/src/components/ui/section-heading.tsx` — title + optional trailing link
- `apps/mobile/src/components/ui/settings-row.tsx` — icon, label, value, chevron
- `apps/mobile/src/components/ui/initials-avatar.tsx` — optional halo ring
- `apps/mobile/src/components/ui/segmented-tabs.tsx` — underline tabs, N items
- `apps/mobile/src/components/ui/secondary-button.tsx` — orange outline
- `apps/mobile/src/components/ui/surface-card.tsx` — white rounded container
- `apps/mobile/src/components/ui/transcript-entry.tsx` — `variant: 'live' | 'review'`, optional translation block
- `apps/mobile/src/components/ui/bottom-tab-bar.tsx` — custom `tabBar` render if the default cannot match the design
- One `*.test.tsx` beside each of the above

**Move (git mv, so history survives)**
- `app/(app)/index.tsx` → `app/(app)/(tabs)/index.tsx` (relative imports go one level deeper)
- `app/(app)/settings.tsx` → `app/(app)/(tabs)/settings.tsx`

**Delete:** none.

## Implementation Steps

1. **Measurement gate — do this before writing anything else.**
   `yarn workspace @meetio/mobile add @expo/vector-icons`, then write a throwaway test that
   renders `<Feather name="mic" size={24} />` under `react-test-renderer` and run
   `yarn workspace @meetio/mobile test`. If it fails, work the fallbacks **in this order** and
   record which one was needed: (a) widen `transformIgnorePatterns`; (b) local `jest.mock`;
   (c) a hand-rolled mock in `apps/mobile/jest.setup.ts`, following the `expo-secure-store`
   precedent already in that file. Only when the render is green does the rest of the phase start.
   If all three fail, **stop and report BLOCKED** — the fallback is hand-rolled `View` glyphs and
   that changes the phase's effort materially.
2. Add the tokens to `colors.ts`. Sample each value from the named crop; do not invent. Add the
   contrast rows to `colors.test.ts` and darken any token that fails against `surface` — the
   cream ground, not white. Add the two typography entries.
3. **Prove the route shape.** Create `(tabs)/_layout.tsx` with four `Tabs.Screen`s and
   `git mv` `index.tsx` and `settings.tsx` into it. Then run the app and confirm
   `resolveBootstrapRoute` → `'/(app)'` still lands on the home tab. If it does not, change
   `APP_HOME_ROUTE` to `'/(app)/(tabs)'` **in both** `route-guards.ts` and `bootstrap-route.ts`
   and note it in the hand-back.
4. Run `yarn workspace @meetio/mobile test` and confirm `app-group-layout.test.tsx`,
   `app-index-redirect.test.tsx` and `bootstrap-route.test.ts` are still green.
5. Create the `library.tsx` / `search.tsx` stubs — a `SafeAreaView` with the screen title only.
   They exist so the tab bar has four real destinations before P10/P11 run.
6. Write `app-routes.ts` with every route constant P03–P12 will import.
7. Build `AppIcon`, then the twelve primitives, each with its test, each under 200 lines.
8. Style the tab bar. Try `Tabs` `screenOptions` first; fall back to a custom `tabBar` component
   only if the icon/label/active-colour treatment in `screen-04` and `screen-14` cannot be reached
   through options.

## Todo List

- [ ] Icon library render proven under Jest (or BLOCKED reported)
- [ ] `react-native-svg` removed from `transformIgnorePatterns`
- [ ] New colour tokens added, all contrast rows green against `surface` and `background`
- [ ] `typography.sectionTitle` and `typography.label` added
- [ ] `(tabs)` group created; `index.tsx` and `settings.tsx` moved with `git mv`
- [ ] `/(app)` still resolves to the home tab (or both route files updated in sync)
- [ ] Three pre-existing navigation tests still green
- [ ] `library.tsx` / `search.tsx` stubs in place
- [ ] `app-routes.ts` written
- [ ] 13 primitives + 13 tests, all under 200 lines
- [ ] Tab bar matches `screen-04` and `screen-14`
- [ ] typecheck + full test suite exit 0

## Success Criteria

- Launching the app lands on the home tab with a four-tab bar; each tab switches.
- `permission`, `consent` and every P04–P09 route render **without** the tab bar.
- `yarn workspace @meetio/mobile test` exits 0 with no pre-existing test modified except
  `colors.test.ts` (additions only).
- Every primitive is renderable in isolation from its test with no store, no router, no fixture.

## Risk Assessment

| Risk | Likelihood | Impact | Countermeasure |
|---|---|---|---|
| `/(app)` stops resolving after the nested group | Medium | High — dead boot redirect, app unusable | Step 3 proves it before any screen phase starts; fallback is a 2-line change in both route files |
| `@expo/vector-icons` breaks under Jest | Medium | High — 10 phases depend on it | Step 1 is a hard gate with three ordered fallbacks and an explicit BLOCKED exit |
| A new token fails AA on cream | High | Low — caught by the test | Darken the hue, keep it; `primaryStrong` is the existing precedent |
| Default `Tabs` styling cannot match the design | Medium | Low | Custom `tabBar` component, already scoped as an owned file |
| A primitive's prop surface proves wrong once a screen phase uses it | Medium | Medium — would force an edit to a P01-owned file mid-parallel | Screen phases must report the gap to P13 rather than edit; P13 holds fix authority |
| `git mv` of `settings.tsx` breaks its relative imports | High | Low — typecheck catches it immediately | Run typecheck right after the move, before anything else |

## Security Considerations

- The auth guard in `app/(app)/_layout.tsx` is **not touched**. Nesting `(tabs)` beneath it means
  every tab inherits the same redirect; verify by running the existing guard test unmodified.
- `@expo/vector-icons` is a first-party Expo package; no new network or permission surface.
- No secrets, no env vars, no storage changes in this phase.

## Next Steps

- Unblocks: phases 03–12 (all of them).
- Runs in parallel with: phase 02.
- Report to phase 13: the resolved value of `APP_HOME_ROUTE`, which Jest fallback (if any) was
  needed for icons, and the final prop signature of every primitive.
