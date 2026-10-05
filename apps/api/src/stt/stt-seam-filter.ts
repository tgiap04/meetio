interface Token {
  raw: string;
  norm: string;
}

const normalise = (word: string) => word.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

const tokenize = (text: string): Token[] =>
  text
    .split(/\s+/)
    .filter(Boolean)
    .map((raw) => ({ raw, norm: normalise(raw) }))
    .filter((t) => t.norm.length > 0);

/** Words kept as "what was already emitted" — enough to cover the replayed overlap of a rotation. */
const TAIL_LIMIT = 64;
/** One coincidental word is not a repeat; two in a row at the seam are. */
const MIN_FRESH_MATCH = 2;

interface Match {
  /** Words of N that duplicate the emitted tail. */
  matched: number;
  /** Tail words still expected to repeat in the next final (N lay wholly inside the tail). */
  rest: string[];
}

/**
 * Removes the text a freshly opened Live session repeats at a rotation seam. The new session is
 * replayed the last couple of seconds of audio, so its first finals restate words the old session
 * already delivered. `begin` arms the filter with the words emitted so far; each final is then
 * aligned against them — a suffix of the tail equal to a prefix of the new text is dropped — until
 * one final no longer overlaps (the seam is over). Matching ignores case and punctuation.
 */
export class SeamFilter {
  private emitted: string[] = [];
  private expected: string[] | null = null;
  private engaged = false;

  /** Records text that was delivered to the client, as the tail the next seam is matched against. */
  noteEmitted(text: string): void {
    this.emitted.push(...tokenize(text).map((t) => t.norm));
    if (this.emitted.length > TAIL_LIMIT) this.emitted.splice(0, this.emitted.length - TAIL_LIMIT);
  }

  tailWords(count: number): string[] {
    return this.emitted.slice(-count);
  }

  begin(tail: string[] = this.emitted): void {
    this.expected = tail.map(normalise).filter(Boolean);
    this.engaged = false;
  }

  get active(): boolean {
    return this.expected !== null;
  }

  filterPartial(text: string): string {
    if (!this.expected) return text;
    const tokens = tokenize(text);
    const match = this.align(tokens);
    return match ? join(tokens.slice(match.matched)) : text;
  }

  filterFinal(text: string): string {
    if (!this.expected) return text;
    const tokens = tokenize(text);
    const match = this.align(tokens);
    if (!match) {
      this.expected = null;
      return text;
    }
    this.engaged = true;
    this.expected = match.rest.length > 0 ? match.rest : null;
    return join(tokens.slice(match.matched));
  }

  private align(tokens: Token[]): Match | null {
    const expected = this.expected!;
    const starts = this.engaged ? [0] : expected.map((_, i) => i);
    const minimum = this.engaged ? 1 : MIN_FRESH_MATCH;
    for (const start of starts) {
      const overlap = Math.min(expected.length - start, tokens.length);
      if (overlap < minimum) continue;
      if (tokens.slice(0, overlap).every((t, j) => t.norm === expected[start + j])) {
        return { matched: overlap, rest: expected.slice(start + overlap) };
      }
    }
    return null;
  }
}

const join = (tokens: Token[]) => tokens.map((t) => t.raw).join(' ');
