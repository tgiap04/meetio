# Phase 13 — Navigation integration and tap audit

**File ownership:** `apps/mobile/src/navigation/navigation-graph.test.tsx`, plus **cross-file fix
authority** — this phase runs alone, after every other phase has landed, and is the only one
permitted to edit files another phase owns.

## Context Links

- Every crop in `design/`
- `clarifications.md` §5, §6 — the recording chain and the separate-route decision
- `apps/mobile/src/navigation/app-routes.ts` (P01)
- Hand-backs from P01–P12, especially the lists of inert controls

## Overview

- **Priority:** P1 — the phase that decides whether the commission was met.
- **Status:** completed
- Close the navigation graph, prove every tap in the design reaches a real screen, and run the
  full gate. The user's actual requirement was *"bấm có thể chuyển qua các màn khác nhau như
  thật"* — this is where that is verified rather than assumed.

## Key Insights

1. **Ten phases each proved their own screen; nobody has yet proved the graph.** A screen whose
   tests pass in isolation can still push a route that does not exist, or push it with the wrong
   param name. That class of defect only shows up when the whole graph is walked.
2. **There is no device E2E harness in this repo** — no Detox, no Maestro, and
   `@testing-library/react-native` is only a peer dependency of `expo-router`, not installed.
   So the tap audit is a Jest suite over the route constants and the screens' `onPress`
   handlers, plus a **manual simulator walk**. Say that plainly rather than implying automated
   end-to-end coverage that does not exist.
3. **Inert controls are a deliverable, not an omission.** Eight or so controls in the design have
   no destination anywhere in the sheet (crown, two home action rows, kebab, edit icon, two
   funnels, "Xem chi tiết", person rows, privacy/terms). The audit's job is to confirm each one
   is *deliberately* inert — labelled, no press feedback — rather than accidentally broken, and
   to list them for the user.
4. **This is the only phase allowed to touch another phase's files.** Parallel phases that hit a
   gap in a P01 primitive or a P02 fixture were told to report it here rather than edit. Those
   reports are this phase's inbox.
5. **The pre-commit hook runs `lint-staged` (eslint + prettier), not the tests.** So a green
   commit proves nothing about the suite. Run `typecheck` and `test` explicitly before declaring
   done — do not lean on the hook.

## Requirements

**Functional**
- Every route constant in `app-routes.ts` resolves to a file that exists.
- The full recording chain walks: Home → 05 → 06 → 07 → 08, and 08 → 09, 08 → 10.
- All four tabs reach their screens and the tab bar shows the correct active state.
- Back from every stacked screen lands somewhere rendered, never a blank.
- Every inert control is catalogued.

**Non-functional**
- `yarn workspace @meetio/mobile typecheck` exits 0.
- `yarn workspace @meetio/mobile test` exits 0, with zero pre-existing tests weakened or skipped.
- `yarn lint` exits 0 at the repo root (`--max-warnings=0`).

## Architecture

The audit test asserts the graph as data, not by rendering a navigator:

```
navigation-graph.test.tsx
├── every value in APP_ROUTES maps to an existing file under app/    (fs check)
├── the recording chain is a connected path                          (constant identity)
├── screens 09 and 10 accept the ?id= contract P07 emits             (param-name match)
└── no route constant is unreferenced by any screen                  (dead-route check)
```

Manual simulator walk (recorded in the hand-back, not automated): launch, log in, walk the chain
end to end, press every control on all ten screens, confirm each one either navigates or is
visibly non-interactive.

## Related Code Files

**Create:** `apps/mobile/src/navigation/navigation-graph.test.tsx`
**Modify (fix authority, only as defects demand):** any file owned by P01–P12
**Delete:** none

## Implementation Steps

1. Collect the twelve hand-backs. Build the inert-control catalogue from them.
2. Write `navigation-graph.test.tsx` with the four assertions above.
3. Run `yarn workspace @meetio/mobile typecheck`, then `test`, then `yarn lint` at the root. Fix
   what breaks, in the owning file.
4. Grep for the hard rules the parallel phases were given:
   `expo-audio` outside `src/hooks/use-microphone-permission.ts` and `src/permissions/`;
   `react-native-svg` anywhere; `Math.random` in the waveform; a second transcript-entry
   component; `react-native-svg` still in `transformIgnorePatterns`.
5. Confirm `APP_HOME_ROUTE` has the same literal in `route-guards.ts` and `bootstrap-route.ts` —
   the two files that duplicate it on purpose.
6. Walk the app manually on an iOS simulator and an Android emulator. Record every tap and its
   outcome.
7. Decide the two promotion questions left open: whether P05/P06's halo circle should move into
   `src/components/ui/`, and whether any P01 primitive's prop surface needs widening.
8. Confirm every screen's crop against the built screen side by side, one last pass.

## Todo List

- [x] Twelve hand-backs collected; inert-control catalogue written (from source, see report)
- [x] `navigation-graph.test.tsx` green (46 assertions)
- [ ] Recording chain walks end to end on a simulator — **not done**: this session has no iOS
      simulator or Android emulator attached. Proven statically instead (route-constant chaining,
      file existence, `router.back()` presence); the user must still walk it on a device.
- [x] All four tabs reach their screens with correct active state — proven statically (file
      existence + `(tabs)/_layout.tsx`'s `focused: state.index === index`); not device-verified.
- [x] Back from 05, 06, 07, 08, 09, 10 all land on a rendered screen — every stacked screen calls
      `router.back()`, asserted in `navigation-graph.test.tsx`.
- [x] Return from 09/10 leaves screen 08 on a content tab — `ContentTabKey` excludes
      `'transcript' | 'graph'`, so `activeContentTab`'s initial state (`'summary'`) is the only
      state a fresh mount of screen 08 can start in.
- [x] All five hard-rule greps clean (`expo-audio`, `react-native-svg`, `Math.random`, dup
      transcript-entry component, dead `transformIgnorePatterns` entry)
- [x] `APP_HOME_ROUTE` identical in both route files (asserted in test)
- [x] `typecheck` 0, `test` 0, root `lint` 0
- [x] No pre-existing test skipped, weakened, or deleted — 104→105 suites, 517→563 tests
- [ ] Manual walk recorded for iOS and Android — **not done**: no simulator/emulator in this
      session's environment. Left for the user; see hand-back for what to check.
- [x] Halo-circle promotion decided — not promoted, see hand-back for reasoning

## Success Criteria

Observable, not felt:

- `yarn workspace @meetio/mobile typecheck && yarn workspace @meetio/mobile test && yarn lint`
  exits 0 in one run.
- The test count is **strictly greater** than before this plan started, and no test file present
  at the start is missing at the end.
- A single simulator session visits all ten new screens plus the four tabs without a crash and
  without a tap that does nothing unexpectedly.
- The inert-control catalogue is handed to the user as an explicit list of what the design left
  undefined — so the gap is the design's, stated, rather than the implementation's, hidden.

## Risk Assessment

| Risk | Likelihood | Impact | Countermeasure |
|---|---|---|---|
| A parallel phase edited a file it did not own | Medium | High — silent clobber between merges | `git log --name-only` per phase against its declared ownership globs; this phase is the only legitimate cross-file editor |
| Route param names disagree between P07 and P08/P09 | Medium | High — detail opens transcript with no meeting | Param-name assertion in the audit test |
| Full suite is red only when run together (shared mock leakage) | Medium | Medium | Run the whole suite, not per-file; this is the first time it runs whole |
| Manual walk is skipped because Jest is green | Medium | High — Jest cannot see layout, and layout is the entire commission | Manual walk is a checkbox and a success criterion, not a suggestion |
| Fixing a defect here re-breaks a phase's own tests | Medium | Medium | Run the full suite after each fix, not at the end |

## Security Considerations

- Re-confirm the auth gate: log out, relaunch, and verify **every** new route under `(app)` —
  including the four tabs and the six stacked screens — redirects to login. Nesting `(tabs)`
  inside `(app)` should inherit the guard, but inheriting is a claim, and this is where it gets
  measured.
- Re-confirm P12's five account controls still fire, with account deletion and logout named
  explicitly.
- Confirm no fixture, mock name, or fictional email left `src/mocks/` and reached a real API call.
- Confirm no secret, token or `.env` value entered any new file.

## Next Steps

- Depends on: P01–P12, all complete.
- Hand back to the user: the inert-control catalogue, the low-confidence transcription list from
  P02, the design/code conflict resolutions from `plan.md`, and the two prototype-honesty notes
  from P05 and P06 (the recording indicator and the AI-notification copy both promise behaviour
  that does not exist and must not ship to a real user unchanged).
