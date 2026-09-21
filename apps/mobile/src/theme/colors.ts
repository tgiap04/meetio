/**
 * Meetio colour palette, aligned with `design.png` at the repo root.
 *
 * Values marked "measured" were sampled from that file; the rest are derived to
 * sit consistently with them. The design is warm throughout — the app
 * background is a cream tint rather than pure white, and dividers are warm
 * rather than blue-grey.
 *
 * ## Contrast, stated plainly
 *
 * White on `primary` is **2.62:1**. That is below WCAG AA for body text (4.5:1)
 * and below the 3:1 floor for UI components. It is what `design.png` shows, and
 * it is the brand colour, so `primaryText` keeps it — but that is a deliberate
 * trade, not an oversight.
 *
 * Use `primaryStrong` for orange **text and small icons on light backgrounds**:
 * it holds the same hue at 4.93:1 on white and 4.57:1 on `surface`, where
 * `primary` itself would be 2.62:1 and effectively unreadable at body size.
 *
 * **Measure against `surface`, not `background`.** Every screen sits on the
 * cream `surface`; pure white is only for cards. Cream is darker than white, so
 * a ratio that clears AA on white can still fail on the ground the text is
 * actually painted on — `primaryStrong` was #B75F01 (4.52 on white, **4.19 on
 * cream**) and `textMuted` was #6B7683 (4.62 / **4.28**) until both were
 * measured against the real background. `colors.test.ts` now checks both.
 *
 * Entity colours for the knowledge-graph screen are keyed by **node palette**,
 * not by entity type: `screen-10-knowledge-graph.png` colours each node
 * individually — the two Person nodes are two different hues, and so are the
 * two Task nodes. Four palettes (`entityBlue`, `entityMint`, `entityLavender`,
 * `entityAmber`) plus the solid `entityProjectFill` cover every node in the
 * design; a fixture assigns each node a palette key, not a type-to-colour map.
 */
export const colors = {
  // --- Brand -------------------------------------------------------------
  /** Brand orange. Measured #FE6D01 in the design; this is the exact brand value. */
  primary: '#F68001',
  /** Same hue, darkened until it clears AA on cream too: 4.57:1 on `surface`,
   *  4.93:1 on white. For orange text and small icons. */
  primaryStrong: '#AE5A01',
  /** measured — peach wash behind badges, active pills and highlighted rows. */
  primaryTint: '#FEF3E6',
  /** On solid `primary` fills. See the contrast note above. */
  primaryText: '#FFFFFF',
  /**
   * measured — the orange fills in the design are a diagonal gradient, not flat:
   * lighter at the top-left, deeper at the bottom-right, with the brand `primary`
   * sitting between the two ends. Sampled along the diagonal of the splash icon
   * tile in design.png. Used for the icon tile and the round mic buttons.
   */
  primaryGradientFrom: '#FD8021',
  primaryGradientTo: '#F56904',

  // --- Neutrals ----------------------------------------------------------
  /** Cards and sheets sit on pure white above `surface`. */
  background: '#FFFFFF',
  /** measured — warm cream screen background. */
  surface: '#F9F6F0',
  /** Warm divider, low contrast by intent: the design separates with tone, not lines. */
  border: '#EAE4DA',
  /** measured — dark slate, 13.7:1 on white. Not pure black; the design never uses it. */
  text: '#212F3C',
  /** 4.53:1 on `surface`, 4.88:1 on white — secondary copy clears AA on both. */
  textMuted: '#68727F',

  // --- Semantic ----------------------------------------------------------
  /** Processing complete. Darkened from the measured #1E8E5A (3.67:1 on
   *  `successTint`, below AA) until it clears AA on its own tint too — same
   *  move as `primaryStrong`. */
  success: '#177049',
  /** measured — mint wash behind "Đã xử lý" badges. */
  successTint: '#DEF7EB',
  danger: '#D64545',
  /** "Đang xử lý" (processing) badge text. Darkened from the measured
   *  #FC7437 (2.53:1 on `surface`) until it clears AA on `warningTint`,
   *  `surface` and `background` — same move as `primaryStrong`. */
  warning: '#B14F19',
  /** measured — amber wash behind "Đang xử lý" badges, screen 07/04. */
  warningTint: '#FDEFDD',

  // --- Cards ---------------------------------------------------------------
  /** measured (screen 06) — pale-blue translation card. Text on it uses the
   *  existing `text` token; no separate text colour needed (12.1:1). */
  translationTint: '#ECF2F8',

  // --- Knowledge-graph node palettes ---------------------------------------
  // Screen 10: node fills are per-node, not per-type. See the doc comment
  // above. Text colours are each palette's hue darkened until it clears AA
  // against its own tint, `surface`, and `background`.
  /** measured #C7D5F4 — one of the two Person node fills. */
  entityBlueTint: '#C7D5F4',
  entityBlueText: '#1A3570',
  /** measured #D6F7E5 — one of the two Task node fills. */
  entityMintTint: '#D6F7E5',
  entityMintText: '#0F5C36',
  /** measured #E2DCFE — the other Person node fill. */
  entityLavenderTint: '#E2DCFE',
  entityLavenderText: '#3E2A73',
  /** measured #FCECCB — the other Task node fill. */
  entityAmberTint: '#FCECCB',
  entityAmberText: '#8A3F07',
  /** measured #FE7E34 — the solid Project-node circle. White text on it
   *  (`primaryText`) is the same deliberate sub-AA trade as `primary`; see
   *  the contrast note above. */
  entityProjectFill: '#FE7E34',
} as const;
