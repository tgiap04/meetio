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

/**
 * A transcript turn. No speaker field: audio comes in as one mixed stream from
 * a laptop speaker, so nothing can attribute a turn to a person (US-13).
 */
export interface TranscriptLine {
  readonly id: string;
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
// Retired by Phase 13: screen 10 now renders `GET /meetings/:id/graph`'s real
// `MeetingGraphNode`/`MeetingGraphEdge` (`@meetio/shared`), not this fixture
// shape — see `src/components/knowledge-graph/`.

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
