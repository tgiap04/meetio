# Phase 02 — Mock fixtures module

**File ownership:** `apps/mobile/src/mocks/**`

## Context Links

- Every crop in `design/` — this phase transcribes content from all of them
- `clarifications.md` §"Nguồn dữ liệu mock": typed fixtures, content taken verbatim, nothing invented
- `apps/mobile/src/theme/typography.ts` → `isRenderableVietnameseText`, reused as a test assertion
- `apps/mobile/src/content/onboarding-pages.ts` — the existing precedent for a typed content module

## Overview

- **Priority:** P1 — blocks phases 03–12.
- **Status:** completed
- One module holding every piece of text, number and relationship the ten screens display.
  Independent of Phase 01: fixtures define domain shapes, primitives take primitive props, and
  the two meet only inside a screen phase.

## Key Insights

1. **Verbatim means verbatim.** Where a crop is blurry the transcription is a guess, and a guess
   recorded as fact is worse than a flagged gap. Every low-confidence string gets a
   `// LOW CONFIDENCE:` comment naming the crop, so P13 and the reviewer can check it against the
   full-resolution design rather than trusting it.
2. **The same four meetings recur across screens 04, 12 and 13** with different metadata shown.
   One `meetings` array, three views of it — not three arrays. Marketing Brief appears only in
   screen 12.
3. **Screen 13 says "Cuộc họp (3)" and draws 2 rows.** The fixture carries 3 meetings in that
   group and the screen derives the count from `.length`, so the label and the list can never
   disagree. Which meeting is the unseen third is a judgement call — use `Project Planning`,
   already in the set, and mark it `// INFERRED:`.
4. **Screen 10's node colours contradict its filter chips** (two Person nodes in different
   colours, two Task nodes in different colours). The fixture stores `type`, not a colour;
   colour is derived from type in P09. See `plan.md` conflict 2.
5. **Avatars are `initials`, not image URIs.** No image assets exist in the repo and inventing
   binary assets is out of scope. Screen 14 already draws initials, so this is the design's own
   idiom rather than a substitution.

## Requirements

**Functional**
- A typed shape for every list the screens render, with no `any` and no optional field used as a
  discriminator.
- Content sourced only from the crops. No filler, no lorem, no extrapolated rows beyond the one
  `// INFERRED:` case above.

**Non-functional**
- Each file under 200 lines; split by domain, not by screen.
- `as const` + `satisfies` so a typo in a status string is a compile error.
- Every file under 200 lines and covered by the phase's test file.

## Architecture

```
src/mocks/
├── types.ts                    — all interfaces + unions, no data
├── meetings.mock.ts            — the 4 meetings (screens 04, 12, 13)
├── transcript.mock.ts          — 4 lines + the 1 translation (screens 06, 09)
├── meeting-detail.mock.ts      — summary paragraph + 3 action items (screen 08)
├── knowledge-graph.mock.ts     — 5 nodes, 4 edges, 3 relations (screen 10)
├── search-results.mock.ts      — 3 groups: Cuộc họp, Tài liệu, Người (screen 13)
├── recording-options.mock.ts   — source/language/translation/quality (screen 05)
├── settings-entries.mock.ts    — 5 rows + 2 "Về Meetio" rows (screen 14)
├── index.ts                    — barrel
└── mocks.test.ts               — one test file for the module
```

Data flow: `*.mock.ts → index.ts → screen component → P01 primitive props`. Fixtures are
`readonly` and never mutated; a screen that filters returns a new array.

### Types (shapes, not values)

```
MeetingStatus   = 'done' | 'processing' | 'queued'
Meeting         { id, title, durationMinutes, date, status, initials }
TranscriptLine  { id, speaker, initials, timestamp, text, translation? }
ActionItem      { id, title, assignee, due }
GraphNodeType   = 'person' | 'task' | 'project'
GraphNode       { id, label, type, isCentral }
GraphEdge       { fromId, toId }
GraphRelation   { id, subjectId, verb, objectId }
SearchGroup     { id, label, kind: 'meeting' | 'document' | 'person', items }
RecordingOption { id, label, description? }
SettingsEntry   { id, icon, label, value?, route? }
```

## Related Code Files

**Create:** the nine files listed above.
**Modify:** none.
**Delete:** none.

## Implementation Steps

1. Write `types.ts` first. Nothing else compiles until the unions are fixed.
2. Transcribe `screen-04` and `screen-12` into `meetings.mock.ts`: Sprint Review (42 phút,
   12/05/2025, done), Client Discussion (28 phút, 10/05/2025, done), Project Planning (51 phút,
   08/05/2025, processing), Marketing Brief (38 phút, 01/05/2025, done).
3. Transcribe `screen-09`'s four transcript lines and attach `screen-06`'s English translation to
   the first line only — that is the only translation the design draws.
4. Transcribe `screen-08`'s summary paragraph and three action items.
5. Transcribe `screen-10`'s five nodes, the edges radiating from "Dự án ABC", and the three
   relation rows. Flag the short labelled edge at centre-right as `// LOW CONFIDENCE:` — the
   crop does not resolve it.
6. Transcribe `screen-13`'s three result groups. Flag the search-field placeholder as
   `// LOW CONFIDENCE:`.
7. Transcribe `screen-05`'s options and `screen-14`'s settings rows.
8. Write `mocks.test.ts`.

## Todo List

- [ ] `types.ts` — no `any`, unions closed
- [ ] Four meetings transcribed with status values matching the badges drawn
- [ ] Transcript lines + the single translation
- [ ] Meeting summary + 3 action items
- [ ] Graph nodes/edges/relations, colour-free
- [ ] Three search groups, count derived not literal
- [ ] Recording options + settings entries
- [ ] Barrel export
- [ ] `mocks.test.ts` green
- [ ] Every `// LOW CONFIDENCE:` / `// INFERRED:` marker collected into the hand-back

## Success Criteria

- `yarn workspace @meetio/mobile typecheck` exits 0.
- `mocks.test.ts` asserts: every id is unique within its collection; every `MeetingStatus` is a
  member of the union; every graph edge references a node that exists; every Vietnamese string
  returns `true` from `isRenderableVietnameseText`.
- Every low-confidence transcription is marked in-source, and the hand-back lists them.

## Risk Assessment

| Risk | Likelihood | Impact | Countermeasure |
|---|---|---|---|
| A blurry crop is transcribed wrong | High | Low — text-only, trivially corrected | `// LOW CONFIDENCE:` markers + a hand-back list; P13 re-checks against the full design |
| A fixture shape does not fit what a screen phase needs | Medium | Medium — would force an edit to a P02-owned file mid-parallel | Screen phases report the gap to P13; P13 holds fix authority |
| Vietnamese diacritics break under the system font | Low | Medium | `isRenderableVietnameseText` asserted over every string, as `typography.test.ts` already does |
| Mock data is mistaken for real data later | Low | High — a fake meeting reaching a user | Directory named `mocks/`, every file suffixed `.mock.ts`, barrel comment stating it is design-sourced placeholder content |

## Security Considerations

- Names and the email `anh.nguyen@meetio.app` come from the design sheet and are fictional. No
  real personal data enters the repository.
- Fixtures are compile-time constants. Nothing is fetched, stored or persisted, so there is no
  new data-at-rest surface.

## Next Steps

- Unblocks: phases 03–12.
- Runs in parallel with: phase 01.
- Report to phase 13: the list of low-confidence transcriptions.
