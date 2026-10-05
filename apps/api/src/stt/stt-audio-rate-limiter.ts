/** Real-time PCM16 16 kHz mono. */
const BYTES_PER_MS = 32;

/**
 * Token bucket on audio bytes: a phone sends real time, so a stream may burst a few seconds (a
 * reconnect flush) and then must stay near 1x. Anything much faster is not a microphone.
 */
export class AudioRateLimiter {
  private tokens: number;
  private lastRefill = Date.now();

  constructor(
    private readonly burstMs: number,
    /** How much faster than real time the sustained rate may be. */
    private readonly speedLimit: number,
  ) {
    this.tokens = burstMs * BYTES_PER_MS;
  }

  allow(bytes: number): boolean {
    const now = Date.now();
    this.tokens = Math.min(this.burstMs * BYTES_PER_MS, this.tokens + (now - this.lastRefill) * BYTES_PER_MS * this.speedLimit);
    this.lastRefill = now;
    if (bytes > this.tokens) return false;
    this.tokens -= bytes;
    return true;
  }
}
