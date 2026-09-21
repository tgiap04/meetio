/**
 * Turns a real `display_name` into the 1-2 letter avatar initials the design
 * draws ("NA" for "Nguyễn Văn Anh"). `InitialsAvatar` (P01) only slices the
 * first two characters of whatever string it is given — it does not know
 * about word boundaries — so the per-word derivation has to happen here,
 * once, before the name reaches that primitive.
 */
export function deriveInitials(displayName: string): string {
  const words = displayName.trim().split(/\s+/).filter(Boolean);

  if (words.length === 0) {
    return '';
  }
  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }
  return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase();
}
