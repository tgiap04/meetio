/**
 * Shapes for every mock fixture screens 04–14 consume. No data here — see the
 * sibling `*.mock.ts` files for the actual (design-sourced) values.
 *
 * These types are the contract the ten parallel screen phases build against,
 * so every union is closed and every discriminator is a required field, never
 * optional.
 */

// --- Meetings (screens 04, 08, 12, 13) -------------------------------------

export type MeetingStatus = 'done' | 'processing' | 'queued';

export interface Meeting {
  readonly id: string;
  readonly title: string;
  readonly durationMinutes: number;
  /** Verbatim design format, `DD/MM/YYYY`. */
  readonly date: string;
  readonly status: MeetingStatus;
  /** Two-letter avatar initials — the design draws initials, never a photo URI. */
  readonly initials: string;
}

// --- Transcript (screens 06, 09) -------------------------------------------

export interface TranscriptLine {
  readonly id: string;
  readonly speaker: string;
  readonly initials: string;
  /** Verbatim design format, `MM:SS`. */
  readonly timestamp: string;
  readonly text: string;
  /** Only the one line the design actually translates carries this. */
  readonly translation?: string;
}

// --- Meeting detail (screen 08) ---------------------------------------------

export interface MeetingSummary {
  readonly meetingId: string;
  readonly paragraph: string;
}

export interface ActionItem {
  readonly id: string;
  readonly title: string;
  readonly assignee: string;
  /** Verbatim design format, `DD/MM`. */
  readonly due: string;
}

// --- Knowledge graph (screen 10) --------------------------------------------

/** Drives the filter chips (Person / Project / Task). */
export type GraphNodeType = 'person' | 'task' | 'project';

/**
 * Drives node colour. The design colours each node individually rather than
 * by type — two Person nodes differ (blue vs. lavender), as do the two Task
 * nodes (mint vs. amber) — so colour cannot be derived from `type` alone.
 * `orange` is reserved for the single central Project node.
 */
export type GraphPaletteKey = 'blue' | 'lavender' | 'mint' | 'amber' | 'orange';

export interface GraphNode {
  readonly id: string;
  readonly label: string;
  readonly type: GraphNodeType;
  readonly paletteKey: GraphPaletteKey;
  readonly isCentral: boolean;
  /**
   * The type caption drawn beneath the node's label ("Person", "Task"). The
   * central node has no room for this inside its circle, so the design
   * renders it outside, on a short connector dash of its own — same role,
   * different position. Only the central node carries this field.
   */
  readonly caption?: string;
}

export interface GraphEdge {
  readonly fromId: string;
  readonly toId: string;
}

export interface GraphRelation {
  readonly id: string;
  readonly subjectId: string;
  readonly verb: string;
  readonly objectId: string;
}

// --- Search (screen 13) -----------------------------------------------------

export interface SearchMeetingItem {
  readonly kind: 'meeting';
  readonly id: string;
  readonly title: string;
  readonly durationMinutes: number;
  readonly date: string;
  readonly status: MeetingStatus;
  readonly snippet: string;
}

export interface SearchDocumentItem {
  readonly kind: 'document';
  readonly id: string;
  readonly title: string;
  readonly status: MeetingStatus;
  readonly relatedTo: string;
}

export interface SearchPersonItem {
  readonly kind: 'person';
  readonly id: string;
  readonly name: string;
  readonly initials: string;
  readonly meetingCount: number;
}

export type SearchResultItem = SearchMeetingItem | SearchDocumentItem | SearchPersonItem;

export interface MeetingSearchGroup {
  readonly id: string;
  /** Base label with no count baked in — the screen derives `(N)` from `items.length`. */
  readonly label: string;
  readonly kind: 'meeting';
  readonly items: readonly SearchMeetingItem[];
}

export interface DocumentSearchGroup {
  readonly id: string;
  readonly label: string;
  readonly kind: 'document';
  readonly items: readonly SearchDocumentItem[];
}

export interface PersonSearchGroup {
  readonly id: string;
  readonly label: string;
  readonly kind: 'person';
  readonly items: readonly SearchPersonItem[];
}

export type SearchGroup = MeetingSearchGroup | DocumentSearchGroup | PersonSearchGroup;

// --- Recording setup (screen 05) --------------------------------------------

export interface RecordingOption {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
}

/** The single currently-selected value shown per row; the design draws no
 *  expanded option list for language, translation target, or quality mode. */
export interface RecordingSettingsDefaults {
  readonly language: string;
  readonly translationEnabled: boolean;
  readonly translationTarget: string;
  readonly qualityMode: string;
}

// --- Settings (screen 14) ---------------------------------------------------

export interface SettingsEntry {
  readonly id: string;
  /** Icon key for `AppIcon` (P01). Kept as a plain string here so this
   *  fixture module has no import dependency on P01's icon facade. */
  readonly icon: string;
  readonly label: string;
  readonly value?: string;
  readonly route?: string;
}
