# Review: Mobile UI screens 04–14 from design.png

Date: 2026-09-21. Reviewer pass over the uncommitted working tree in `apps/mobile`, read against
`plan.md`, `clarifications.md`, and `reports/tap-audit-phase-13.md` in this plan directory, plus
the design crops in `design/`.

## Scope

- Files reviewed: all untracked/modified files under `apps/mobile/app/(app)/**`,
  `apps/mobile/src/components/**` (home, icons, knowledge-graph, library, meeting-detail,
  recording-done, recording-live, recording-setup, search, settings, ui), `apps/mobile/src/mocks/**`,
  `apps/mobile/src/navigation/{app-routes,navigation-graph.test,route-shape.test}.ts(x)`,
  `apps/mobile/src/theme/{colors,typography}.ts(+test)`, `apps/mobile/package.json`.
- Lines: ~6,000 across the new/changed tree (largest file 198 lines, all under the 200-line rule).
- Depth: full read of route files, layouts, guards, fixtures, and settings; targeted read of the
  remaining screens' component trees; 5 design crops opened and compared pixel-for-pixel against
  their screens (04, 06, 08, 10, 14).

## Assessment

This lands close to what the brief asked for: ten screens, mock data, real navigation, and —
unusually for a UI-only pass — an honest paper trail for every place the UI cannot back up what
it shows. Typecheck is clean, lint is clean (`eslint apps/mobile --max-warnings=0`, zero output),
and the suite is green: 556/556 passing across 105 suites (one worker SIGSEGV on
`home-screen.test.tsx` in the full run is a Jest worker crash, not a code failure — it passes
clean in isolation, 7/7). The auth gate is unbroken, the settings screen's five real controls are
verifiably intact (diffed line-for-line against the deleted file — same mutations, same payload
shapes, same destructive-action confirm dialog, same `DevResetButton`), and the tap-audit's
control catalogue holds up against direct source reading — I did not find an inert control it
missed or a "real" one that turned out to be theatre. The invented-copy items (empty states,
"Chưa có bản dịch") are flagged in-source exactly where the brief expects. Design fidelity on the
five spot-checked screens (04, 06, 08, 10, 14) is close: layout, copy, and the per-node graph
palette all match their crops.

The one thing this pass adds beyond the phase 13 tap audit: the settings screen's notification
toggle carries a comment claiming `GetMeResponse` has no read-back for the saved preference. That
claim is false as of the current `packages/shared` types — the read path exists and the code
doesn't use it. It's pre-existing (carried forward unchanged from the deleted `settings.tsx`, not
introduced by this phase), but it's worth surfacing now since the comment's reasoning is stated
as fact and no longer is.

## Critical

None found.

## High

**1. Notifications toggle ignores an existing read-back field; the comment justifying that is now incorrect.**
`apps/mobile/app/(app)/(tabs)/settings.tsx:38-45` initializes `notificationsEnabled` from
`useState(true)` with a comment stating `GetMeResponse` "does not currently expose the user's
saved notification preference — only `UpdateMeRequest` accepts one, write-only." But
`packages/shared/src/auth/user.types.ts:12-13` defines `PublicUser.notification_settings:
Record<string, boolean>` explicitly as "Read-back for `UpdateMeRequest.notification_settings`,"
and `GetMeResponse.user` (`packages/shared/src/users/users.types.ts:9-12`) is typed `PublicUser`.
The field is already on the wire. Effect: every time this screen mounts, the switch shows "on"
regardless of what the user actually saved last, until they touch it — a real UX bug, not a
prototype limitation, since this control was already wired to a live mutation before this phase.
Not introduced by this work (the identical `useState(true)` and identical comment existed in the
deleted `apps/mobile/app/(app)/settings.tsx:20-24` before the restyle), so it's outside this
UI-only phase's stated scope to fix — but the comment should not keep asserting something the
types now contradict. Fix: `useState(() => meQuery.data.user.notification_settings?.enabled ??
true)`, or at minimum correct the comment so the next person doesn't re-trust it.

## Medium

**2. `meeting-detail.tsx`'s fixtures don't key by meeting — already flagged in the tap audit, confirmed real.**
`apps/mobile/app/(app)/meeting-detail.tsx:38,86` render `MEETING_SUMMARY`/`ACTION_ITEMS`
unconditionally regardless of the resolved `meeting.id`. Tapping any meeting row other than
"Sprint Review" (e.g. "Client Discussion" from the home screen's recent list) still shows Sprint
Review's summary and action items. `tap-audit-phase-13.md` §6 already documents this as a known
mock-data limit outside phase scope — confirmed correct, not re-litigating, just noting it's the
single largest "is it real" gap a manual walkthrough will hit first, since the home screen and
library both link to meetings this doesn't distinguish.

**3. `search.tsx`'s `visibleGroups` cast papers over a real type hole rather than resolving it.**
`apps/mobile/app/(app)/(tabs)/search.tsx:83-85` — the `as SearchGroup[]` cast is explained in a
comment as restoring a correlation TypeScript's structural typing loses when mapping a
discriminated union. The comment's reasoning is correct (verified: `.map` over
`SearchGroup[]` returning `{ ...group, items: ... }` does widen to `{kind: SearchGroup['kind'],
items: SearchGroup['items'][number][]}[]`, decoupling `kind` from the item shape it implies), but
a cast that suppresses a real type-checker complaint is worth a second look before calling it
done — a future edit to `SearchGroup`'s union shape will not get caught here. A narrower fix:
`group.items.flatMap((item) => (matchesQuery(item, normalizedQuery) ? [item] : []))` inside a
`switch` keyed on `group.kind` would let TS narrow `items` per-branch without the cast. Low
urgency — the current code is correct at runtime, just not provably so to the compiler.

**4. `route-shape.test.ts`'s "no test files under app/" guard checks presence, not prevention.**
`apps/mobile/src/navigation/route-shape.test.ts:52-58` is a good catch-after-the-fact test — it
will fail CI if a `*.test.tsx` lands under `app/` again — but it's a lagging indicator: the file
still has to be committed and CI has to run before anyone notices, same failure mode that let six
files land there twice already per the hand-back. A `pre-commit` lint rule (ESLint
`no-restricted-paths` or a `find app -name '*.test.*'` check in the existing git hook) would catch
it before the commit exists rather than after. Worth adding given this has recurred twice in one
project; not blocking, since the regression test is real coverage today.

## Low

**5. `RecordingDoneScreen`'s "Knowledge Graph" push omits `?id=` while `MeetingDetailScreen`'s does.**
`apps/mobile/app/(app)/recording-done.tsx:29-31` calls `router.push(MEETING_GRAPH_ROUTE)` with no
params, while `meeting-detail.tsx:53` pushes the same route with `{ id: meeting.id }`. Both are
harmless today since `meeting-graph.tsx` doesn't read the param yet (by design, per its own
comment), but the two call sites disagreeing on whether to supply `id` is the kind of drift that
becomes a real bug the day the graph screen starts using it. Minor — flagging so it's a conscious
choice rather than an accident when someone wires the read path.

**6. `entity-colors.test.ts` type-checks palette shape but never asserts against the fixture's actual keys.**
`apps/mobile/src/components/knowledge-graph/entity-colors.test.ts` iterates a hardcoded
`ALL_PALETTE_KEYS` array that has to be kept in sync by hand with `GraphPaletteKey` in
`src/mocks/types.ts`; nothing fails if a new palette key is added to the type but not to this
array. Cosmetic — the current five keys match — but a `satisfies readonly GraphPaletteKey[]`
annotation on `ALL_PALETTE_KEYS` (mirroring the pattern already used in
`knowledge-graph.mock.ts`) would make that drift a compile error instead of a silent test gap.

## Edge Cases Turned Up

- Logged-out access to any of the 6 stacked screens or 4 tabs: blocked correctly — `(tabs)` nests
  inside `(app)/_layout.tsx`, which still renders exactly one `Stack` gated by
  `shouldRedirectFromAppGroup`, unedited. `route-shape.test.ts` proves the file-tree shape;
  `app-group-layout.test.tsx` (pre-existing, untouched) proves the redirect predicate.
- Consent gate on the home screen's primary CTA (`recording_consent_at` check,
  `app/(app)/(tabs)/index.tsx:35,41`) is unchanged, real, and correctly routes to `CONSENT_ROUTE`
  vs. `RECORDING_SETUP_ROUTE` — not accidentally bypassed by the restyle.
- Delete-account confirmation (`Alert.alert` with a destructive-styled "Xóa" button that is the
  only path to `deleteAccountMutation.mutate`) survived the move into
  `settings-account-section.tsx` byte-for-byte in logic, only relocated.
- The "Action Items" and "Tóm tắt" tabs in `meeting-detail.tsx` are not symmetric: selecting
  "action-items" hides the summary but `ActionItemsSection` renders unconditionally either way
  (`meeting-detail.tsx:82-86`), so both tabs show action items and only "Tóm tắt" additionally
  shows the summary. Matches the single design crop available (both blocks visible together under
  the active "Tóm tắt" tab) — flagging as a read worth confirming once an "Action Items" tab
  crop/behavior is available, not a defect against what can currently be verified.
- Camera/bookmark circles on the live-recording screen (`recording-controls.tsx`) are real
  `Pressable`s with `onPress` left `undefined` rather than non-interactive `View`s — tapping them
  is a genuine no-op (no crash, no visual feedback), consistent with "deliberately inert," but
  worth a manual tap to confirm no ripple/opacity flash reads as "half-wired" on a real device.

## Done Well

- The prototype-honesty documentation (screen 06's "Đang ghi âm", screen 07's notification
  promise) is written where it matters most — in the component that makes the claim, not just in
  a phase hand-back nobody will read at 2am before a demo. Both are unambiguous about consequence
  ("must never reach a real user unchanged," "a consent problem, not a cosmetic one"). That's
  adequate honesty for an internal prototype; I'd still put a one-line comment at the very top of
  `recording-live.tsx`'s screen component (not just in the JSDoc block) if this is about to be
  demoed to anyone who might mistake it for working.
- Every deliberately inert control is either `disabled` (kebab menu, explicit
  `accessibilityLabel="Menu (chưa khả dụng)"`) or has no `onPress` wired, and every one is
  commented as intentional — none of the fourteen items the tap audit lists reads as an
  accidentally-dead handler when read from source.
- Colour additions are held to the same WCAG AA bar as the existing tokens, including against both
  grounds the app actually paints on (`surface` and `background`, not just white) — the graph's
  five new text/tint pairs, `warning`/`warningTint`, and the re-darkened `success` are all covered
  by `colors.test.ts`'s exhaustive `it.each`, and the two intentional sub-AA trades (`primary`
  white text, per the design) are pinned with an explicit "not an accident" test rather than
  silently passing or silently failing.
- File-ownership discipline held under load: thirteen phases landed with zero file collisions
  visible in the diff, and the P13 cross-file fixes (dead `PERMISSION_ROUTE` removal, the
  `meeting-graph.tsx` `?id=` param gap) are exactly the class of fix that only a late-serializing
  integration phase should make.
- The settings restyle is a genuine "keep the logic, change the skin" job — I diffed the deleted
  file against the four new component files and every mutation call, payload shape, and the
  destructive-action confirm dialog are unchanged, just relocated behind props.

## Actions In Order

1. Correct or remove the stale "no read-back" comment in `settings.tsx` (Medium→High per the code
   truth, though pre-existing) — either wire `notification_settings.enabled` from `/me` or, at
   minimum, stop asserting the field doesn't exist. `apps/mobile/app/(app)/(tabs)/settings.tsx:38-42`.
2. Note (don't necessarily fix now, since it's explicitly out of this phase's scope per the tap
   audit) that `meeting-detail.tsx` needs per-meeting fixtures before a real walkthrough tapping
   different library rows will look right. `apps/mobile/app/(app)/meeting-detail.tsx:38,86`.
3. Consider replacing the `as SearchGroup[]` cast in `search.tsx` with a narrowing `switch` if this
   file gets touched again. `apps/mobile/app/(app)/(tabs)/search.tsx:83-85`.
4. Add a pre-commit guard (not just a test) against `*.test.*` files landing under `app/`, given
   it's recurred twice already.
5. Run the four manual-walkthrough items `tap-audit-phase-13.md` lists under "What this audit
   could not do" on a real simulator/device before this is demoed — nothing in this review found
   reason to doubt them, but none of them has actually been executed yet.

## Numbers

- Type coverage: `tsc --noEmit` clean, 0 errors.
- Test coverage: 556/556 tests passing across 105 suites (1 suite hit a Jest worker SIGSEGV in
  the full run, passed 7/7 in isolation — environment flake, not a code failure).
- Lint findings: 0 (`eslint apps/mobile --max-warnings=0`).

## Still Unresolved

- No on-device/simulator verification has been performed by anyone yet (neither the implementers,
  the P13 tap audit, nor this review) — all four items in `tap-audit-phase-13.md`'s "What this
  audit could not do" section remain open.
- The notification-toggle read-path gap (Finding 1) is real but pre-existing; whether to fix it
  now or track it separately from this UI-only plan is a product call, not a review call.

**Status:** DONE_WITH_CONCERNS
**Summary:** The ten-screen build holds up well — auth gate intact, settings mutations verifiably preserved, typecheck/lint/tests all green, design fidelity strong on every spot-checked screen, and the prototype-honesty items are documented where they'll actually be seen. One real (pre-existing, not introduced here) bug surfaced: the settings notification toggle's justifying comment is now factually wrong since the shared types already expose a read-back field it ignores. Score: 8/10.
**Concerns/Blockers:**
1. [High] Notifications toggle defaults wrong and its justifying comment is stale — `packages/shared` already exposes `PublicUser.notification_settings` as a read-back; `settings.tsx:38-45` doesn't use it. Pre-existing, not introduced by this phase.
2. [Medium] `meeting-detail.tsx` shows "Sprint Review" content for every meeting id — already known and documented in the phase-13 tap audit, confirmed still true, will be the first thing a manual walkthrough notices.
3. [Medium] `search.tsx`'s `as SearchGroup[]` cast suppresses a real type-narrowing gap rather than resolving it — correct at runtime today, not provably so to the compiler.
4. [Medium] The `app/`-test-file guard is a regression test, not a pre-commit gate — it's caught the mistake once already after the fact; a hook-level check would catch it before commit.
5. No manual on-device walkthrough has happened yet — this review, like the tap audit before it, is a source-level read only.
