import { Feather } from '@expo/vector-icons';

/**
 * Semantic icon names this app's UI needs, each mapped to one concrete Feather
 * glyph below. Screens and primitives never import `@expo/vector-icons`
 * directly or pick a glyph by name themselves — they ask for what the icon
 * MEANS ("chevronLeft", "search") and this file is the only place that decides
 * which line-icon draws it. That keeps every icon in the app visually
 * consistent (one icon family, one stroke weight) and makes a future
 * icon-family swap a one-file change.
 *
 * `AppIconName` is derived from `GLYPH`'s keys rather than written out twice,
 * so adding a row below is the only edit an icon needs — the union, and the
 * test that renders every name, both follow automatically.
 *
 * `keyof typeof Feather.glyphMap` on the values means a mistyped Feather glyph
 * is a compile error, not an icon that silently fails to draw.
 *
 * **Screen phases must not edit this file.** Ten of them run in parallel and
 * would collide here. The names below already cover every control drawn across
 * `design/screen-04` … `screen-14`; a screen needing one that is genuinely
 * missing reports the gap rather than adding it mid-flight.
 */
const GLYPH = {
  // --- Navigation shell --------------------------------------------------
  home: 'home',
  library: 'archive',
  search: 'search',
  settings: 'settings',
  chevronLeft: 'chevron-left',
  chevronRight: 'chevron-right',
  close: 'x',
  more: 'more-vertical',
  filter: 'sliders',

  // --- Settings rows -----------------------------------------------------
  language: 'globe',
  translate: 'repeat',
  micSettings: 'mic',
  aiEngine: 'cpu',
  storage: 'database',
  shield: 'shield',
  document: 'file-text',

  // --- Home actions (screen 04) -----------------------------------------
  crown: 'award',
  mic: 'mic',
  audioFile: 'file-plus',
  castDevice: 'cast',

  // --- Recording setup + capture (screens 05, 06) ------------------------
  bluetooth: 'bluetooth',
  camera: 'camera',
  pause: 'pause',
  bookmark: 'bookmark',

  // --- Processing status (screen 07) -------------------------------------
  check: 'check',
  checkCircle: 'check-circle',
  clock: 'clock',
  sparkle: 'zap',

  // --- Meeting detail + transcript (screens 08, 09) ----------------------
  calendar: 'calendar',
  edit: 'edit',
  circle: 'circle',
  play: 'play',
  /** Circular arrow with "10" — jump back ten seconds. */
  skipBack: 'rotate-ccw',
  /** Circular arrow with "10" — jump forward ten seconds. */
  skipForward: 'rotate-cw',

  // --- Library + search rows (screens 12, 13) ----------------------------
  waveform: 'activity',

  // --- Knowledge graph (Phase 13) -----------------------------------------
  // The ten parallel screen-build phases that owned this file are long
  // finished; Phase 13 is the sole active screen work, so it adds the three
  // names its entity screens genuinely need rather than reusing an
  // unrelated glyph.
  trash: 'trash-2',
  merge: 'git-merge',
  undo: 'corner-up-left',
} as const satisfies Record<string, keyof typeof Feather.glyphMap>;

export type AppIconName = keyof typeof GLYPH;

/** Every name, for exhaustive iteration in tests. */
export const APP_ICON_NAMES = Object.keys(GLYPH) as AppIconName[];

export interface AppIconProps {
  name: AppIconName;
  size?: number;
  color?: string;
  testID?: string;
}

export function AppIcon({ name, size = 24, color, testID }: AppIconProps) {
  return <Feather color={color} name={GLYPH[name]} size={size} testID={testID} />;
}
