/**
 * Five nodes, four edges and three relation rows for the knowledge-graph
 * screen, transcribed from `design/screen-10-knowledge-graph.png`.
 *
 * Per-node palette: the design colours each node individually rather than by
 * type (two Person nodes differ, two Task nodes differ), so `paletteKey`
 * carries the actual colour and `type` stays free to drive the Person /
 * Project / Task filter chips without disagreeing with it. Hex values sampled
 * in `design/measured-colors.md`.
 */
import type { GraphEdge, GraphNode, GraphRelation } from './types';

export const GRAPH_NODES: readonly GraphNode[] = [
  {
    id: 'du-an-abc',
    label: 'Dự án ABC',
    type: 'project',
    paletteKey: 'orange',
    isCentral: true,
    // LOW CONFIDENCE: design/screen-10-knowledge-graph.png, crop
    // 110x40+830+688 at 9x — this caption sits on its own short connector
    // dash off the central node (not an edge label; the other nodes' type
    // captions sit inside their own pill/circle, this one has no room and
    // sits outside instead). The text itself does not resolve at source
    // resolution: two words, first starting with capital D. Best reading is
    // "Dự án" (fits the two-word shape and the caption role), but every
    // other node's caption is in English ("Person", "Task") while this
    // reading is Vietnamese — the design is either inconsistent here or this
    // reading is wrong. Needs the full-resolution source design file.
    caption: 'Dự án',
  },
  {
    id: 'nguyen-van-anh',
    label: 'Nguyễn Văn Anh',
    type: 'person',
    paletteKey: 'blue',
    isCentral: false,
  },
  {
    id: 'le-thi-mai',
    label: 'Lê Thị Mai',
    type: 'person',
    paletteKey: 'lavender',
    isCentral: false,
  },
  {
    id: 'api',
    label: 'API',
    type: 'task',
    paletteKey: 'mint',
    isCentral: false,
  },
  {
    id: 'authentication',
    label: 'Authentication',
    type: 'task',
    paletteKey: 'amber',
    isCentral: false,
  },
] as const satisfies readonly GraphNode[];

export const GRAPH_EDGES: readonly GraphEdge[] = [
  { fromId: 'du-an-abc', toId: 'nguyen-van-anh' },
  { fromId: 'du-an-abc', toId: 'api' },
  { fromId: 'du-an-abc', toId: 'le-thi-mai' },
  { fromId: 'du-an-abc', toId: 'authentication' },
] as const satisfies readonly GraphEdge[];

export const GRAPH_RELATIONS: readonly GraphRelation[] = [
  {
    id: 'relation-1',
    subjectId: 'nguyen-van-anh',
    verb: 'phụ trách',
    objectId: 'api',
  },
  {
    id: 'relation-2',
    subjectId: 'api',
    verb: 'thuộc',
    objectId: 'du-an-abc',
  },
  {
    id: 'relation-3',
    subjectId: 'le-thi-mai',
    verb: 'tham gia',
    objectId: 'authentication',
  },
] as const satisfies readonly GraphRelation[];
