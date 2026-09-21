---
title: "Mobile UI screens 04–14 from design.png"
description: "Build the 10 remaining Meetio mobile screens as navigable UI on mock data, on a shared tab-navigator + token foundation."
status: completed
priority: P2
effort: 37h
branch: main
tags: [mobile, expo-router, ui, design-implementation, mock-data]
created: 2026-09-21
---

# Mobile UI screens from design.png

UI only. Mock data. **Every tap navigates for real.** No backend, no new API calls. Screens 01–03
are already built and serve as the style reference. Crops: `design/` · Settled decisions:
`clarifications.md` (authoritative — do not re-litigate).

## Dependency graph

```
P01 foundation ──┐
                 ├──> P03 P04 P05 P06 P07 P08 P09 P10 P11 P12  (parallel) ──> P13 integration
P02 fixtures  ───┘
```

P01 and P02 are independent and run in parallel. P03–P12 own disjoint file sets and all run at
once after P01+P02 land. P13 serializes and is the only phase with cross-file fix authority.

## Phases

| # | Phase | Screen / crop | Effort | Status |
|---|-------|---------------|--------|--------|
| 01 | [Foundation: tabs, tokens, icons, primitives](phase-01-foundation-tabs-tokens-primitives.md) | — (all) | 5h | completed |
| 02 | [Mock fixtures module](phase-02-mock-fixtures-module.md) | — (all) | 2h | completed |
| 03 | [Home tab](phase-03-home-tab-screen.md) | `screen-04-trang-chu.png` | 3h | completed |
| 04 | [Recording settings](phase-04-recording-setup-screen.md) | `screen-05-cai-dat-ghi-am.png` | 2h | completed |
| 05 | [Live recording](phase-05-live-recording-screen.md) | `screen-06-ghi-am-truc-tiep.png` | 3h | completed |
| 06 | [Post-recording status](phase-06-post-recording-screen.md) | `screen-07-sau-khi-ghi-am.png` | 2h | completed |
| 07 | [Meeting detail](phase-07-meeting-detail-screen.md) | `screen-08-tong-quan-cuoc-hop.png` | 3h | completed |
| 08 | [Transcript](phase-08-transcript-screen.md) | `screen-09-transcript.png` | 3h | completed |
| 09 | [Knowledge graph](phase-09-knowledge-graph-screen.md) | `screen-10-knowledge-graph.png` | 4h | completed |
| 10 | [Library tab](phase-10-library-tab-screen.md) | `screen-12-thu-vien.png` | 2h | completed |
| 11 | [Search tab](phase-11-search-tab-screen.md) | `screen-13-tim-kiem.png` | 3h | completed |
| 12 | [Settings tab restyle](phase-12-settings-tab-restyle.md) | `screen-14-cai-dat.png` | 3h | completed |
| 13 | [Navigation integration + tap audit](phase-13-navigation-integration-and-tap-audit.md) | — (all) | 2h | completed |

## Decisions carried by this plan

- **Icons: add `@expo/vector-icons`.** Not in this tree and *not* a transitive dependency of
  `expo@57` or `expo-router@57` — verified. Pure JS + fonts, so no native rebuild. Behind an
  `AppIcon` facade so the set is swappable in one file. P01.
- **SVG: do NOT add `react-native-svg`.** Native module; `ios/`+`android/` are gitignored prebuild
  output, so it forces every developer through prebuild + pod install for decoration. Graph edges
  are rotated `View`s, as `Arc`/`Blob` already do. Its `transformIgnorePatterns` entry is dead
  config and gets removed. P01, P09.
- **Tabs nest inside `(app)`**, at `app/(app)/(tabs)/`. `app/(app)/_layout.tsx` is not edited, so
  the existing auth-guard test stays green. P01.
- **Stacked routes are flat with `?id=`**, not `[id]` dirs — keeps ownership disjoint. P07.
- **Avatars are initials, not photos.** No image assets exist; screen 14 already uses initials.

## Rollback

Uniform, because the shape is uniform. P03–P12 are additive files plus one route file each:
`git revert` the phase commit and the app returns to P01+P02 with that tab or route stubbed.
P02 reverts cleanly — nothing outside `src/mocks/` imports it until a screen phase lands.
P01 is the only phase with a non-trivial undo: revert must take `package.json` **and**
`yarn.lock` together, and the `git mv`s reverse as renames. Revert P01 only after P03–P12 are
already reverted, or the four tab screens lose their layout. P13 edits nothing on its own.

## Known design/code conflicts (resolved in-phase, not silently)

1. Screen 14 drops retention / notifications / logout / delete-account, which exist and work.
   → Kept, restyled into the design's card idiom below "Về Meetio". P12.
2. Screen 10 colours nodes per-node (blue, lavender, mint, amber) while its filter chips imply
   per-type. → **Coloured per node, filtered by type.** This reverses the planner's original
   call. The colours were then measured out of `design.png` with ImageMagick (see
   `design/measured-colors.md`) and the design really does give the two `Person` nodes different
   colours, and the two `Task` nodes different colours. Colouring by type would have rendered
   both Persons identically and visibly diverged from the design the user asked to match. So
   `GraphNode` carries both `type` (drives the filter chips) and `paletteKey` (drives colour).
   P02/P09.
3. Screens 12/13/14 draw a back chevron on what are tab roots. → Dropped; tab roots have no back. P10/P11/P12.
4. Screen 12 header and search placeholder are a designer copy-paste from an AI Q&A screen.
   → Header "Thư viện" per `clarifications.md`; placeholder borrowed verbatim from screen 13. P10.
5. Screen 13 says "Cuộc họp (3)" but draws 2 rows. → Fixture holds 3; count is derived. P02/P11.
