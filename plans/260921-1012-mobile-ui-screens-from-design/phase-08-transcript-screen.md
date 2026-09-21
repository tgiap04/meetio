# Phase 08 — Transcript (screen 09)

**Design crop:** `design/screen-09-transcript.png`
**File ownership:** `apps/mobile/app/(app)/meeting-transcript.tsx`, `apps/mobile/src/components/transcript/**`

## Context Links

- Crop: `design/screen-09-transcript.png`
- `clarifications.md` §6 — a separate route, opened from screen 08's Transcript tab
- P01 primitives: `ScreenHeader`, `SearchField`, `TranscriptEntry` (`variant="review"`), `AppIcon`
- P02 fixtures: `transcript.mock.ts`

## Overview

- **Priority:** P2
- **Status:** completed
- The full transcript with an in-transcript search field and a bottom audio player. No audio
  plays; the player is a static control surface with a working progress bar position.

## Key Insights

1. **The entry layout differs from screen 06** — timestamp sits *above* the speaker name here,
   and there is no translation card. This is `TranscriptEntry variant="review"`, owned by P01.
   Building a second entry component is a DRY violation and an ownership violation at once.
2. **The search field should actually filter.** It is a text input the design drew; making it
   inert when filtering four fixture lines is trivial to implement is the wrong call. Filter
   case-insensitively on `text` and `speaker`, and render `EmptyState` (already in the repo) when
   nothing matches. Vietnamese comparison: lowercase both sides, do not strip diacritics —
   stripping them is a behaviour the design gives no evidence for.
3. **`expo-audio` must not be imported.** Same hard rule as P05, same reason.
4. **The progress bar position is fixed at the design's value** (`00:18 / 42:18`, roughly 0.7%).
   The crop draws the knob near the left edge, so match the drawn position rather than computing
   it from the ratio — the two disagree in the crop and the drawing is what we are matching.
   Note the discrepancy in the hand-back.
5. **The edit (pencil) icon has no destination.** Inert, labelled, reported.
6. Play / skip-back-10 / skip-forward-10 are tappable but change nothing. Give them pressed
   feedback so a tap is visibly acknowledged.

## Requirements

**Functional**
- Header: back chevron → screen 08, "Transcript", inert edit icon.
- Search field filtering the entry list live.
- Four transcript entries in review layout with hairline dividers.
- Bottom player: progress track + knob, `00:18 / 42:18`, three controls.

**Non-functional**
- Under 200 lines per file; test per component.
- The player is pinned to the bottom and does not scroll with the list.

## Architecture

```
meeting-transcript.tsx
├── useLocalSearchParams<{ id?: string }>   (accepted, used for the back title only)
├── ScreenHeader (back + inert edit)
├── SearchField (P01, controlled)  ──► query
├── FlatList of TranscriptEntry variant="review"  ← transcript.mock filtered by query
│     └── EmptyState when the filtered list is empty
└── AudioPlayerBar  (progress + 3 controls, pinned)
```

Single piece of state: `const [query, setQuery] = useState('')`.

## Related Code Files

**Create:** `app/(app)/meeting-transcript.tsx`, `src/components/transcript/transcript-list.tsx`,
`audio-player-bar.tsx`, `transcript-progress-track.tsx`, + a test beside each
**Modify:** none · **Delete:** none

## Implementation Steps

1. Read the crop; measure the knob diameter, the track height, the play-circle diameter.
2. `TranscriptProgressTrack` — filled segment, grey remainder, knob; position as a `0..1` prop.
3. `AudioPlayerBar` composing the track, the time label and three `Pressable` controls.
4. `TranscriptList` consuming P01's `TranscriptEntry variant="review"` plus `EmptyState`.
5. Assemble; wire back → `router.back()`.
6. Tests: all four entries render; typing "JWT" narrows to the two lines containing it; typing
   nonsense renders `EmptyState`; the back chevron calls `router.back()`; a diacritic-bearing
   query ("Mai") matches its speaker.

## Todo List

- [ ] Crop read; player dimensions measured
- [ ] `TranscriptEntry variant="review"` reused, no second component
- [ ] Zero `expo-audio` imports (grep to confirm)
- [ ] Search filters live, empty state handled
- [ ] Player pinned, does not scroll
- [ ] Edit icon inert and reported
- [ ] typecheck + tests green

## Success Criteria

- Matches the crop side by side.
- Reached from screen 08's Transcript tab; back returns to screen 08 with a content tab active.
- Filtering works with Vietnamese input.

## Risk Assessment

| Risk | Likelihood | Impact | Countermeasure |
|---|---|---|---|
| A second `TranscriptEntry` is built here | Medium | Medium — DRY + ownership violation | Stated as a hard rule; P13 greps for duplicate entry components |
| `expo-audio` imported to make the player real | Medium | High — crashes the whole suite at import | Hard rule + grep in the todo list |
| Diacritic-insensitive matching is added speculatively | Medium | Low | Explicitly out of scope; plain lowercase comparison only |
| Player scrolls away with the list | Medium | Low | Player sits outside the `FlatList`, in the screen's flex column |
| Drawn knob position contradicts the stated timestamp | High | Low | Match the drawing; record the discrepancy |

## Security Considerations

- Transcript content is fixture text. When real transcripts arrive this screen becomes a display
  surface for meeting audio content — at that point the `?id=` lookup needs authorization, which
  it does not have today. Note it forward; do not build it now.

## Next Steps

- Depends on: P01, P02, and P07's query-param contract. Parallel with: P03–P07, P09–P12.
- Report to P13: the knob-position discrepancy and the inert edit icon.
