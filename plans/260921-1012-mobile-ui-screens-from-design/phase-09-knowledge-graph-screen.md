# Phase 09 — Knowledge graph (screen 10)

**Design crop:** `design/screen-10-knowledge-graph.png`
**File ownership:** `apps/mobile/app/(app)/meeting-graph.tsx`, `apps/mobile/src/components/knowledge-graph/**`

## Context Links

- Crop: `design/screen-10-knowledge-graph.png`
- `clarifications.md` §6 — a separate route, opened from screen 08's Graph tab
- P01 tokens: `entityPersonText/Tint`, `entityTaskText/Tint`, `entityProjectText/Tint`
- P01 primitives: `ScreenHeader`, `FilterChipRow`, `SurfaceCard`
- P02 fixtures: `knowledge-graph.mock.ts`
- Rotation precedent: `src/components/illustrations/arc.tsx`

## Overview

- **Priority:** P2 — the highest-effort screen and the one that settled the SVG question.
- **Status:** completed
- A static node-and-edge diagram with type filtering, plus a relation list. Drawn with
  positioned and rotated `View`s. **No `react-native-svg`.**

## Key Insights

1. **No SVG, and this is the phase that proves it was unnecessary.** An edge between two points
   is a `View` of width `hypot(dx, dy)`, height `1.5`, positioned at the midpoint and rotated by
   `atan2(dy, dx)`. That is pure arithmetic, unit-testable, and needs no native module. Adding
   `react-native-svg` would force every developer through a prebuild + pod install because
   `/ios` and `/android` are gitignored generated output. See `plan.md`.
2. **Node positions are fixed fractions of the canvas**, not a layout engine. A force-directed
   layout for five static nodes is exactly the complexity YAGNI exists to refuse. Store
   `{ x: 0..1, y: 0..1 }` per node in the component (not in the fixture — position is
   presentation, type is data) and multiply by the measured canvas size.
3. **The design colours nodes per-node; the filter chips imply per-type.** Resolved in favour of
   type (Person = blue, Task = green, Project = orange). The crop's purple second Person and
   amber second Task are designer variation, not a third and fourth type — there are only three
   chips besides "Tất cả". Record this in the hand-back as a deliberate divergence.
4. **Edge geometry is the one genuinely testable piece of logic in the UI layer.** Extract
   `computeEdgeGeometry(from, to, canvasSize)` into its own module and unit-test it with known
   coordinates. Everything else on this screen is presentation.
5. **Filtering hides nodes and must hide their edges too.** An edge whose endpoint is filtered
   out and still drawn is the obvious defect here. The central Project node stays visible under
   every filter, otherwise the diagram has nothing to radiate from — state that rule.
6. **The short labelled edge at centre-right does not resolve in the crop.** P02 marks it
   `// LOW CONFIDENCE:`. Render whatever P02 transcribed and surface it for review rather than
   quietly dropping it.

## Requirements

**Functional**
- Header: back chevron → screen 08, "Knowledge Graph".
- Filter chips: Tất cả / Person / Project / Task, horizontally scrollable, one active.
- Canvas: central orange circle node + four pill nodes, coloured by type, connected by edges.
- Relation list card: three rows, entity names in their type colour.
- "Xem chi tiết" link — inert, reported.

**Non-functional**
- Under 200 lines per file; test per component.
- Canvas size read via `onLayout`, not hardcoded, so it scales across devices.

## Architecture

```
meeting-graph.tsx
├── ScreenHeader
├── FilterChipRow (P01, controlled)  ──► activeType: GraphNodeType | 'all'
├── GraphCanvas
│     ├── onLayout → { width, height }
│     ├── visibleNodes = filter(nodes, activeType) ∪ { central }
│     ├── visibleEdges = edges where BOTH endpoints are visible
│     ├── GraphEdge ×n     ← computeEdgeGeometry()
│     └── GraphNode ×n     (central circle | pill)
└── RelationList  ← knowledge-graph.mock.relations
```

`entity-colors.ts` maps `GraphNodeType → { tint, text }` from the P01 tokens. One function, one
place, used by both the canvas and the relation list.

## Related Code Files

**Create:** `app/(app)/meeting-graph.tsx`, `src/components/knowledge-graph/graph-canvas.tsx`,
`graph-node.tsx`, `graph-edge.tsx`, `compute-edge-geometry.ts`, `relation-list.tsx`,
`entity-colors.ts`, + a test beside each
**Modify:** none · **Delete:** none

## Implementation Steps

1. Read the crop. Record each node's centre as a fraction of the canvas, and the central
   circle's diameter as a fraction of the width.
2. Write `compute-edge-geometry.ts` **first**, with its test — it is the only real logic here.
   Assert: a horizontal pair yields rotation 0; a vertical pair yields ±90°; length equals the
   Euclidean distance; the midpoint is correct.
3. `entity-colors.ts` + test asserting all three types map to defined tokens.
4. `GraphNode` (central and pill variants), `GraphEdge` (absolute + `transform: [{ rotate }]`).
5. `GraphCanvas` with `onLayout` sizing and the filter rules from Key Insight 5.
6. `RelationList` with type-coloured entity names.
7. Tests: filtering to Person leaves the two Person nodes plus the central node; no edge renders
   with a hidden endpoint; "Tất cả" restores all five; the relation list always shows three rows.

## Todo List

- [ ] Crop read; node fractions and central diameter recorded
- [ ] `computeEdgeGeometry` written and unit-tested before any rendering code
- [ ] Zero `react-native-svg` imports
- [ ] Type→colour mapping in one module, used by canvas and list
- [ ] Filtering hides nodes and their edges; the central node always survives
- [ ] Canvas sized by `onLayout`, not a magic number
- [ ] Low-confidence edge label rendered and flagged
- [ ] typecheck + tests green

## Success Criteria

- Matches the crop side by side at the simulator's default width.
- Rotating the device or running on a wider simulator keeps the edges attached to their nodes —
  the observable proof that `onLayout` sizing works and nothing is hardcoded.
- Every filter chip changes the diagram visibly.

## Risk Assessment

| Risk | Likelihood | Impact | Countermeasure |
|---|---|---|---|
| Rotated-`View` edges look wrong at the joins | Medium | Medium — the reason someone reaches for SVG | Geometry unit-tested first; edges sit *under* nodes so joins are covered by the node fills |
| Edges hardcoded to a fixed canvas size and detaching on other devices | High | Medium | `onLayout` sizing is a success criterion, checked on two simulator widths |
| Someone installs `react-native-svg` mid-phase | Medium | High — forces a prebuild on every developer, unreviewed native change | Forbidden in the todo list; P13 diffs `package.json` |
| Filtering leaves orphan edges | High | Low | Explicit both-endpoints-visible rule + test |
| Type colours fail AA on their tints | Medium | Low | Already asserted by the P01 contrast rows |
| The type-vs-per-node colour divergence is read as a bug | Medium | Low | Recorded in `plan.md` conflict 2 and in the hand-back |

## Security Considerations

- Entity labels are fixture strings rendered inside `<Text>`; no markup interpretation, no
  injection surface.
- No new dependency, so no new supply-chain surface — which is a second, quieter reason the SVG
  decision went the way it did.

## Next Steps

- Depends on: P01, P02, and P07's query-param contract. Parallel with: P03–P08, P10–P12.
- Report to P13: the "Xem chi tiết" link is inert; the low-confidence edge label.
