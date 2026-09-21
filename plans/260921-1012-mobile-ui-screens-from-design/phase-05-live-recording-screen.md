# Phase 05 — Live recording (screen 06)

**Design crop:** `design/screen-06-ghi-am-truc-tiep.png`
**File ownership:** `apps/mobile/app/(app)/recording-live.tsx`, `apps/mobile/src/components/recording-live/**`

## Context Links

- Crop: `design/screen-06-ghi-am-truc-tiep.png`
- `clarifications.md` §5 — chain: 05 → **06** → 07
- P01 primitives: `SegmentedTabs`, `TranscriptEntry` (`variant="live"`), `InitialsAvatar`, `AppIcon`
- P02 fixtures: `transcript.mock.ts`
- Shape precedent: `src/components/illustrations/mic-glyph.tsx` — ratio-driven `View` composition

## Overview

- **Priority:** P2
- **Status:** completed
- The recording surface: status, elapsed time, waveform, three controls, and a bilingual
  transcript feed. **No audio is captured.** Presentation only.

## Key Insights

1. **`expo-audio` must not be imported here.** The repo has already been burned assuming
   `jest-expo` auto-mocks it — importing it crashes at module load, before any test body runs.
   The commission is UI-only, so there is no reason to touch it. This is a hard rule for the phase.
2. **The waveform is static.** Fifty bars with heights driven by a fixed numeric array in the
   component (not `Math.random()` — a random waveform makes every snapshot unstable and every
   re-render jitter). Deterministic data, deterministic test.
3. **The elapsed timer may tick, but must be driven by a mocked-out interval.** Simplest honest
   option: render the design's `00.24.18` statically. If a tick is added, the test must use fake
   timers, and the interval must be cleared on unmount. Recommend static — YAGNI.
4. **The pause button has no "resume" state drawn.** Tapping it advances to screen 07. That is
   the design's only forward edge from this screen; treat pause as "finish" and report it.
5. **`TranscriptEntry` variant matters.** Screen 06 puts the name and timestamp on one line above
   the text and appends a pale-blue translation card; screen 09 puts the timestamp *above* the
   name and has no translation. P01 owns both variants — do not build a second entry component.
6. The Tiếng Việt / Tiếng Anh tabs switch the feed's language in place. When "Tiếng Anh" is
   active, show the translation text as the primary line. Only the first fixture line has a
   translation — the others fall back to their Vietnamese text with a muted note. Report this.

## Requirements

**Functional**
- Red dot + "Đang ghi âm" + elapsed time; X close → back to Home.
- Static waveform in `colors.primary`.
- Left circle (camera), centre orange pause with peach halo → screen 07, right circle (bookmark).
- Two-tab language switch driving the feed.
- Transcript entries from fixtures, first one carrying its translation card.

**Non-functional**
- No `expo-audio`, no permission APIs, no timers unless fake-timer tested.
- Under 200 lines per file; test per component.

## Architecture

```
recording-live.tsx
├── RecordingStatusBar   (dot, label, elapsed, close)
├── Waveform             (fixed heights array, pure)
├── RecordingControls    (3 buttons; centre → APP_ROUTES.recordingDone)
├── SegmentedTabs        (P01, 2 items, controlled)
└── LiveTranscriptFeed   ← transcript.mock, filtered by active language
```

Language tab is the only state: `useState<'vi' | 'en'>('vi')`.

## Related Code Files

**Create:** `app/(app)/recording-live.tsx`, `src/components/recording-live/recording-status-bar.tsx`,
`waveform.tsx`, `recording-controls.tsx`, `live-transcript-feed.tsx`, + a test beside each
**Modify:** none · **Delete:** none

## Implementation Steps

1. Read the crop; count the bars, measure the centre button diameter and its halo ring width.
2. `Waveform`: a `heights: readonly number[]` module constant, each bar a `View` with
   `borderRadius` — mirrored around the centreline as the crop shows.
3. `RecordingControls`: the halo is a second `View` behind the button with a larger radius and
   `colors.primaryTint`, matching how `screen-07`'s check circle is drawn.
4. `LiveTranscriptFeed` consuming P01's `TranscriptEntry variant="live"`.
5. Wire: X → `router.back()`; pause → `router.push(APP_ROUTES.recordingDone)`.
6. Tests: waveform renders the expected bar count; switching to Tiếng Anh shows the English text;
   pause pushes the done route; close goes back.

## Todo List

- [ ] Crop read; bar count and control diameters measured
- [ ] Zero `expo-audio` / permission imports (grep the phase's files to confirm)
- [ ] Waveform deterministic
- [ ] Halo ring behind the pause button
- [ ] Language tabs switch the feed
- [ ] Translation card renders on the first entry only
- [ ] typecheck + tests green

## Success Criteria

- Matches the crop side by side.
- Pause reaches screen 07; X returns to Home.
- The test suite runs this screen without a single native-module mock added to `jest.setup.ts`.

## Risk Assessment

| Risk | Likelihood | Impact | Countermeasure |
|---|---|---|---|
| Someone imports `expo-audio` "to make it real" | Medium | High — crashes every test at import, repeat of a known past failure | Stated as a hard rule; grep for it in the todo list; P13 re-greps |
| A live timer leaks an interval on unmount | Medium | Medium | Recommend static time; if ticking, fake timers + cleanup assertion |
| Random waveform makes tests flaky | Medium | Medium | Fixed heights array, asserted by length |
| `TranscriptEntry` duplicated instead of reused | Medium | Low — DRY violation, and P01 owns that file | Phase explicitly forbids a second entry component |
| English tab looks broken for entries with no translation | High | Low | Muted fallback line; reported to P13 |

## Security Considerations

- This screen displays the word "Đang ghi âm" while recording nothing. That is acceptable inside
  a UI-only prototype, but it must never ship to a user as production behaviour — a recording
  indicator that does not reflect reality is a consent problem, not a cosmetic one. Flag it in
  the hand-back so it is tracked before any real release.
- No microphone permission is requested or checked here.

## Next Steps

- Depends on: P01, P02. Parallel with: P03, P04, P06–P12.
- Report to P13: pause is the only forward edge; the English-tab fallback.
