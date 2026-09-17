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
 * it holds the same hue at 4.52:1 on white, where `primary` itself would be
 * 2.62:1 and effectively unreadable at body size.
 *
 * Entity colours for the knowledge-graph screen (Person / Task / Project) are
 * deliberately absent. That screen belongs to a later phase, and guessing its
 * tokens now would mean maintaining values nothing renders.
 */
export const colors = {
  // --- Brand -------------------------------------------------------------
  /** Brand orange. Measured #FE6D01 in the design; this is the exact brand value. */
  primary: '#F68001',
  /** Same hue, darkened to 4.52:1 on white — for orange text and small icons. */
  primaryStrong: '#B75F01',
  /** measured — peach wash behind badges, active pills and highlighted rows. */
  primaryTint: '#FEF3E6',
  /** On solid `primary` fills. See the contrast note above. */
  primaryText: '#FFFFFF',

  // --- Neutrals ----------------------------------------------------------
  /** Cards and sheets sit on pure white above `surface`. */
  background: '#FFFFFF',
  /** measured — warm cream screen background. */
  surface: '#F9F6F0',
  /** Warm divider, low contrast by intent: the design separates with tone, not lines. */
  border: '#EAE4DA',
  /** measured — dark slate, 13.7:1 on white. Not pure black; the design never uses it. */
  text: '#212F3C',
  /** 4.62:1 on white, so secondary copy still clears AA. */
  textMuted: '#6B7683',

  // --- Semantic ----------------------------------------------------------
  /** Processing complete. */
  success: '#1E8E5A',
  /** measured — mint wash behind "Đã xử lý" badges. */
  successTint: '#DEF7EB',
  danger: '#D64545',
} as const;
