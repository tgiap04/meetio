# Phase 13 tap audit — control catalogue and findings

Date: 2026-09-21. Scope: every control across screens 04–14 (the ten new screens plus the tab
shell) plus the recording/meeting chain. Built by reading every screen's source (`app/(app)/**`,
`app/(app)/(tabs)/**`) and its component tree, cross-checked against the twelve phase hand-backs
recorded in each `phase-XX-*.md`. Verified in code and by `yarn workspace @meetio/mobile test` /
`typecheck` — **not** verified on a device (see "What this audit could not do" below).

## Control catalogue

| Screen | Control | Destination |
|---|---|---|
| 04 Home | "Bắt đầu ghi âm" card | `RECORDING_SETUP_ROUTE` if consented, else `CONSENT_ROUTE` |
| 04 Home | "Xem tất cả" (recent meetings) | `TAB_LIBRARY_ROUTE` |
| 04 Home | Meeting row (recent meetings) | `MEETING_DETAIL_ROUTE?id=` |
| 04 Home | Crown badge | **Inert** — no destination in design; not a `Pressable` |
| 04 Home | "Nhập từ file âm thanh" row | **Inert** — no `onPress` prop passed |
| 04 Home | "Kết nối thiết bị khác" row | **Inert** — no `onPress` prop passed |
| 05 Recording setup | Back chevron | `router.back()` → Home or Settings, whichever pushed here |
| 05 Recording setup | Audio-source cards | Local state only (selection highlight) |
| 05 Recording setup | Ngôn ngữ / Chế độ ghi âm rows | **Inert** — one fixture value each, nothing to cycle to (deliberate, see below) |
| 05 Recording setup | Translation toggle | Local state only |
| 05 Recording setup | "Bắt đầu" | `RECORDING_LIVE_ROUTE` |
| 06 Live recording | X (close) | `router.back()` |
| 06 Live recording | Camera circle | **Inert** — no destination in design |
| 06 Live recording | Pause (centre) | `RECORDING_DONE_ROUTE` — screen's only forward edge |
| 06 Live recording | Bookmark circle | **Inert** — no destination in design |
| 06 Live recording | Tiếng Việt / Tiếng Anh tabs | Local state only (swaps transcript language) |
| 07 Post-recording | Back chevron | `router.back()` → screen 06 |
| 07 Post-recording | "Knowledge Graph" pipeline row | `MEETING_GRAPH_ROUTE` |
| 07 Post-recording | Other 3 pipeline rows (Transcript/Embedding/Tóm tắt) | **Inert** — static status rows, no `onPress` |
| 07 Post-recording | "Xem chi tiết tiến trình" | `MEETING_DETAIL_ROUTE` |
| 08 Meeting detail | Back chevron | `router.back()` |
| 08 Meeting detail | Kebab menu | **Inert** — `disabled`, labelled "Menu (chưa khả dụng)" |
| 08 Meeting detail | Tóm tắt / Action Items tabs | Local state (swap content in place) |
| 08 Meeting detail | Transcript tab | `MEETING_TRANSCRIPT_ROUTE?id=` |
| 08 Meeting detail | Graph tab | `MEETING_GRAPH_ROUTE?id=` |
| 08 Meeting detail | Action-item checkboxes | Local state (checked/unchecked) |
| 09 Transcript | Back chevron | `router.back()` → screen 08 |
| 09 Transcript | Search field | Local state (filters entries in place) |
| 09 Transcript | Audio player bar | **Presentational** — no real playback, see `audio-player-bar.tsx` |
| 09 Transcript | Empty search state | Local state only (invented copy — see Findings §2) |
| 10 Knowledge graph | Back chevron | `router.back()` → screen 08 |
| 10 Knowledge graph | Filter chips (Person/Project/Task/Tất cả) | Local state (filters diagram + relation list) |
| 10 Knowledge graph | Graph nodes | **Inert** — decorative, no drill-down defined |
| 10 Knowledge graph | "Xem chi tiết" (relation list) | **Inert** — static link text, no `onPress` |
| 12 Library (tab) | Search field | Local state (filters both sections) |
| 12 Library (tab) | Funnel icon | **Inert** — no filter-sheet destination in design |
| 12 Library (tab) | Status chips (Tất cả/Đã xử lý/Đang xử lý) | Local state (filters both sections) |
| 12 Library (tab) | Meeting rows | `MEETING_DETAIL_ROUTE?id=` |
| 13 Search (tab) | Search field | Local state (filters visible groups) |
| 13 Search (tab) | Funnel icon | **Inert** — no filter-sheet destination in design |
| 13 Search (tab) | Kind chips (Tất cả/Transcript/Node/Meeting) | Local state (see Findings §3 for the chip→group mapping) |
| 13 Search (tab) | Meeting / document rows | `MEETING_DETAIL_ROUTE?id=` |
| 13 Search (tab) | Person rows | **Inert** — design defines no person screen |
| 14 Settings (tab) | Profile header | Display only (real `/me` data) |
| 14 Settings (tab) | "Cài đặt ghi âm" row | `RECORDING_SETUP_ROUTE` |
| 14 Settings (tab) | Ngôn ngữ / Dịch thuật / AI & GraphRAG / Lưu trữ rows | **Inert** — mock rows, no destination in design |
| 14 Settings (tab) | Privacy policy / Terms rows | **Inert** — no sub-screen in design |
| 14 Settings (tab) | Retention-days field | Real — `useUpdateMeMutation` on blur |
| 14 Settings (tab) | Notifications switch | Real — `useUpdateMeMutation` (see Findings §4 for the read-path gap) |
| 14 Settings (tab) | Logout | Real — `useLogoutMutation` |
| 14 Settings (tab) | Delete account | Real — confirm alert → `useDeleteAccountMutation` |
| 14 Settings (tab) | Dev reset button | Real — clears session, `router.replace('/')` |
| Tab bar (all 4 tabs) | Trang chủ / Thư viện / Tìm kiếm / Cài đặt | Native `Tabs` navigation by file name, active icon/label highlighted |

Fourteen controls are **deliberately inert** in this catalogue (crown, two home secondary rows,
recording-live camera + bookmark, three post-recording pipeline rows, meeting-detail kebab,
graph nodes + "Xem chi tiết" link, library funnel, search funnel, search person rows, four
settings mock rows, two "Về Meetio" rows). Every one of them is either non-`Pressable` or
explicitly labelled/disabled in its own source — none is a silently dead `onPress`.

## Findings from the escalated items

**1. Halo-circle shape (recording-live pause ring vs. recording-done hero) — not promoted.**
Read both implementations (`recording-controls.tsx`'s `halo` behind a `Pressable` button;
`recording-done-hero.tsx`'s nested `halo` → `circle` → icon badge, no press target at all). They
solve different problems — a ring *behind* an interactive control vs. a two-layer static badge —
and neither's prop surface would serve the other without inventing an API neither screen needs
yet. Two occurrences of a similar visual technique is not the same as two occurrences of the same
component. Left as local, duplicated `StyleSheet` blocks in both files, per each phase's own
hand-back reasoning. Revisit only if a third screen needs this exact shape.

**2. Empty-state copy is invented, not design-sourced — left as is, documented here.**
`transcript-list.tsx`: "Không tìm thấy kết quả phù hợp" / "Thử một từ khóa khác." (P08).
`live-transcript-feed.tsx`: "Chưa có bản dịch" (P05). The design draws no empty states for either
screen. Not standardised into a shared component: the two messages serve different semantics (no
search results vs. a translation that hasn't arrived yet), so forcing one shared string would be
less correct, not more consistent. Recorded here as the invented copy it is — a native-speaker
pass before shipping would be worth doing, but is out of this phase's scope.

**3. Search chip→group mapping — read and confirmed coherent.**
`search.tsx`'s `CHIP_GROUP_KINDS`: Tất cả→all three groups, Meeting→`meeting`, Transcript→
`document`, Node→`person`. This is a real gap in the design (four chips, three result-group
kinds) resolved by P11 with a defensible reading (Node ≈ knowledge-graph node ≈ person). Left as
documented in `search.tsx`; no change needed.

**4. `SETTINGS_ENTRIES[*].icon` fixed — was a real type-safety hole.**
`SettingsEntry.icon` was typed `string` and held raw Feather glyph names ('globe', 'clock', …)
that are not `AppIconName` keys; `settings-mock-rows.tsx` worked around it with an `id`-keyed
lookup table (`ICON_BY_ENTRY_ID`), leaving the fixture's own `icon` field write-only dead data.
Decision: **left the fixture as is, id-keyed mapping is the correct fix already in place** — the
comment in `settings-mock-rows.tsx` explains why `SettingsEntry` deliberately avoids importing
`AppIconName` (P02's fixture module has no P01 dependency). Changing `icon`'s type would either
add that dependency or require duplicating `AppIconName`'s literal union in `types.ts`; neither is
worth it for five rows already correctly mapped by `id`. Recorded here as a known, contained
workaround rather than a bug.

**5. Recording-setup's three inert chevron rows — confirmed deliberate.**
"Ngôn ngữ" and "Chế độ ghi âm" render `SettingsSelectRow` with a single fixture value
(`RECORDING_SETTINGS_DEFAULTS`) and nothing to cycle to. P04's hand-back is explicit: inventing a
list of options the design never drew would be worse than leaving them static. Confirmed correct
— reads as "not yet wired to real settings", not as broken.

**6. `MEETING_SUMMARY` / `ACTION_ITEMS` cover only "Sprint Review".**
`meeting-detail.tsx` renders `MEETING_SUMMARY` and `ACTION_ITEMS` unconditionally regardless of
which meeting resolved from `?id=` — both fixtures hold exactly one meeting's content (Sprint
Review). Tapping into any other meeting still shows Sprint Review's summary and action items.
Documented here as a known mock-data limit, not fixed: doing this properly means keying both
fixtures by meeting id, which is fixture-shape work outside this phase's file ownership (P02) and
out of scope for a UI-only prototype. Flag for whoever wires real per-meeting data.

## Cross-file fixes made in this phase (P13's fix authority)

1. **`app-routes.ts`**: removed `PERMISSION_ROUTE` — genuinely dead (zero references anywhere
   outside its own declaration); the mic-permission screen is reached exclusively through
   `MIC_PERMISSION_ROUTE` in `route-guards.ts`/`bootstrap-route.ts`. Caught by the new
   dead-route-check test.
2. **`app/(app)/meeting-graph.tsx`**: added `useLocalSearchParams<{ id?: string }>()` so screen
   10 accepts the same `?id=` contract screen 08 pushes with and screen 09 already declares.
   Previously screen 10 silently dropped the param — a real param-name/contract gap the phase
   file's own risk table called out. Updated `meeting-graph-screen.test.tsx`'s `expo-router` mock
   to stub the added hook.

## Prototype-honesty items (carried forward, not fixed here — out of scope for a UI phase)

- **Screen 06** displays "Đang ghi âm" (recording in progress) while capturing no audio. Fine
  inside this prototype; must not reach a real user unchanged once a real audio pipeline lands
  behind it — a recording indicator that lies is a consent problem.
- **Screen 07**'s `AiProcessingNotice` promises "chúng tôi sẽ thông báo khi hoàn tất" (we'll
  notify you when it's done) with no notification mechanism anywhere in this codebase. Same
  category of issue — cosmetic now, a broken promise to a real user later.

## What this audit could not do

No Detox, no Maestro, `@testing-library/react-native` not installed. `navigation-graph.test.tsx`
proves route constants resolve to real files, the recording chain is a connected sequence of
`router.push` calls, screens 08/09/10 agree on the `?id=` param name, every stacked screen has a
`router.back()` call, and no route constant is orphaned — all read from source text, none of it
rendered. This session also had **no iOS simulator or Android emulator attached**, so the manual
walk the phase file calls for (Step 6, and a named success criterion) was not performed. The user
still needs to:

1. Launch the app, log in, and walk Home → 05 → 06 → 07 → 08, then 08 → 09 and 08 → 10, on both
   platforms.
2. Confirm the tab bar's active-icon highlighting matches `(tabs)/_layout.tsx`'s `focused` logic
   on a real render, not just in source.
3. Tap every inert control in the catalogue above and confirm it visibly does nothing (no crash,
   no dead-looking-but-secretly-live tap) rather than trusting the "no destination in design"
   claim from source alone.
4. Log out and confirm every route under `(app)` — all four tabs, all six stacked screens —
   redirects to login, per the phase file's security section.
