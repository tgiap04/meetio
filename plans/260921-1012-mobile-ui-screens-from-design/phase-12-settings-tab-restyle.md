# Phase 12 — Settings tab restyle (screen 14)

**Design crop:** `design/screen-14-cai-dat.png`
**File ownership:** `apps/mobile/app/(app)/(tabs)/settings.tsx`, `apps/mobile/src/components/settings/**`

## Context Links

- Crop: `design/screen-14-cai-dat.png`
- `clarifications.md` §2 — **keep the working logic, restyle it**. This is the phase that rule
  was written for.
- Existing screen (moved into `(tabs)/` by P01), currently 128 lines carrying: `useMeQuery`,
  `useUpdateMeMutation` (retention days, notification settings), `useDeleteAccountMutation`,
  `useLogoutMutation`, `DevResetButton`
- P01 primitives: `SettingsRow`, `InitialsAvatar`, `SectionHeading`, `SurfaceCard`, `AppIcon`
- P02 fixtures: `settings-entries.mock.ts`

## Overview

- **Priority:** P1 — the phase with the sharpest design-versus-code conflict.
- **Status:** completed
- Restyle Settings to the design **without losing a single working control**.

## Key Insights

1. **The design deletes four working features and this plan does not.** Screen 14 shows five
   chevron rows and two "Về Meetio" links. It shows no retention field, no notifications toggle,
   no logout button, no delete-account flow, no dev reset. All five exist today and all five
   work against the real API.
   **Resolution:** the design's rows render first, exactly as drawn; the existing controls are
   restyled into the same card idiom and placed **below "Về Meetio"** under a "Tài khoản"
   heading. No new route is invented (the design sheet contains no sub-screen for them), nothing
   working is deleted, and the design's own visual language is used throughout. This is the
   single most important decision in the phase — see `plan.md` conflict 1.
2. **The profile header confirms initials avatars are the design's idiom**, not a substitution
   forced by missing assets. `InitialsAvatar` derives from `user.display_name`; the email comes
   from `user.email`. Neither is a fixture.
3. **The five design rows are mock; the account controls are real.** A mixed screen. Put a
   comment at the top of the file saying exactly which half is which, because the next reader
   will otherwise assume the whole thing is one or the other.
4. **The file will exceed 200 lines if restyled in place.** It is already 128. Extract the
   profile header, the mock rows section, the about section and the account section into
   `src/components/settings/`, leaving `settings.tsx` as the hook wiring and composition.
5. **`DevResetButton` stays.** It is a development affordance, already conditional in its own
   file, and removing it because a production mockup does not draw it would cost the team a tool
   for no benefit.
6. **The five mock rows' chevrons open nothing**, except "Cài đặt ghi âm", which should route to
   screen 05 — the screen exists and the label matches exactly. Wiring it is free and removes one
   dead tap. The other four are inert and reported.

## Requirements

**Functional**
- Header "Cài đặt", no back chevron (tab root), tab bar visible with Cài đặt active.
- Profile row: initials avatar with halo, `display_name`, `email` — from `/me`.
- Five design rows; "Cài đặt ghi âm" → screen 05, the rest inert.
- "Về Meetio": privacy policy and terms rows (inert, reported).
- "Tài khoản": retention field, notifications switch, logout, delete account, dev reset — all
  preserved with their existing mutation wiring.
- `LoadingState` and `ErrorState` branches preserved verbatim.

**Non-functional**
- Every file under 200 lines.
- No change to any hook, mutation or API module. This phase owns presentation only.

## Architecture

```
settings.tsx   (hooks + composition only)
├─ isPending → <LoadingState/>          (unchanged)
├─ isError   → <ErrorState onRetry/>    (unchanged)
└─ data →
   ├── SettingsProfileHeader   ← user.display_name, user.email
   ├── SettingsMockRows        ← settings-entries.mock  (one row routes to screen 05)
   ├── SettingsAboutSection    ← 2 inert rows
   └── SettingsAccountSection  ← the EXISTING controls, restyled
         ├── retention TextField  → useUpdateMeMutation
         ├── notifications Switch → useUpdateMeMutation
         ├── logout               → useLogoutMutation
         ├── delete account       → useDeleteAccountMutation (password + confirm Alert)
         └── DevResetButton       (unchanged import)
```

The `notification_settings` read-gap noted in today's file comment (the shared `GetMeResponse`
does not expose the saved value, so it defaults to on) is **carried forward unchanged**. It is a
`packages/shared` gap, out of this phase's ownership; do not paper over it.

## Related Code Files

**Modify:** `app/(app)/(tabs)/settings.tsx` (moved here by P01)
**Create:** `src/components/settings/settings-profile-header.tsx`, `settings-mock-rows.tsx`,
`settings-about-section.tsx`, `settings-account-section.tsx`, + a test beside each
**Delete:** none — and deleting anything here is itself the failure mode
**Must not touch:** `src/hooks/use-account-mutations.ts`, `use-auth-mutations.ts`,
`use-me-query.ts`, `src/api/**`, `packages/shared/**`

## Implementation Steps

1. Read the crop; measure the row height, the avatar diameter and its halo, the card spacing.
2. **Before editing, list every control currently in `settings.tsx`.** That list is the checklist
   the restyle is verified against.
3. Extract the four sections into components, moving the existing JSX rather than rewriting it —
   the mutation calls should survive the move byte-for-byte.
4. Restyle each section to the design's card idiom.
5. Wire "Cài đặt ghi âm" → `APP_ROUTES.recordingSetup`.
6. Tests: pending/error branches still render their states; the profile header shows the mocked
   display name and email; **every one of the five preserved controls still fires its mutation**
   (one test per control, mutations mocked); "Cài đặt ghi âm" pushes screen 05.

## Todo List

- [ ] Crop read; avatar and row dimensions measured
- [ ] Pre-edit inventory of existing controls written down
- [ ] Retention field preserved and firing `useUpdateMeMutation`
- [ ] Notifications switch preserved and firing `useUpdateMeMutation`
- [ ] Logout preserved and firing `useLogoutMutation`
- [ ] Delete account preserved, including the confirmation `Alert`
- [ ] `DevResetButton` preserved
- [ ] `LoadingState` / `ErrorState` branches untouched
- [ ] No hook, API or shared-package file modified
- [ ] Every file under 200 lines
- [ ] typecheck + tests green

## Success Criteria

- Matches the crop for everything the crop draws, with the account section continuing below it
  in the same visual language.
- A diff of `git log -p` on the mutation call sites shows them unchanged in substance.
- Five tests, one per preserved control, prove nothing was lost in the restyle.

## Risk Assessment

| Risk | Likelihood | Impact | Countermeasure |
|---|---|---|---|
| A working control is dropped because the design omits it | **High** | **High** — silently removes account deletion, a GDPR-adjacent capability | Pre-edit inventory + one test per control; called out as the phase's headline risk |
| The restyle rewrites mutation calls instead of moving them | Medium | High — subtle behaviour change under a cosmetic PR | Step 3 says move, not rewrite; review the diff for call-site changes |
| The file exceeds 200 lines | High | Low | Four extracted components already scoped |
| The `notification_settings` read-gap gets "fixed" by touching `packages/shared` | Medium | Medium — scope creep into another package mid-parallel | Explicit must-not-touch list |
| Initials derived wrongly for one-word or diacritic names | Medium | Low | `InitialsAvatar` (P01) tested with "Nguyễn Văn Anh" and a single-word name |

## Security Considerations

- **Account deletion and logout are security controls, not features.** Losing either in a
  restyle is the worst outcome available in this whole plan; the per-control tests exist
  specifically for that.
- The delete-account password field must keep `secureTextEntry` after the restyle — verify it
  explicitly.
- `user.email` is rendered on screen. It already is today; no new exposure.

## Next Steps

- Depends on: P01, P02. Parallel with: P03–P11.
- Report to P13: which of the five design rows remain inert, and confirmation that all five
  account controls survived with tests naming them.
