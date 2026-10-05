/**
 * The last few seconds of PCM, in RAM only, so a replacement Live session can be replayed the audio
 * the old one heard last. Never written to disk or logged (NFR-04). Frames are whole 16-bit
 * samples, so cutting from the newest end keeps every sample aligned.
 */
export class AudioRingBuffer {
  private chunks: Buffer[] = [];
  private bytes = 0;

  constructor(private readonly maxBytes: number) {}

  get size(): number {
    return this.bytes;
  }

  push(frame: Buffer): void {
    this.chunks.push(frame);
    this.bytes += frame.length;
    while (this.bytes > this.maxBytes && this.chunks.length > 0) {
      const excess = this.bytes - this.maxBytes;
      const oldest = this.chunks[0];
      if (oldest.length <= excess) {
        this.chunks.shift();
        this.bytes -= oldest.length;
      } else {
        // Trim an even count so the remaining bytes still start on a sample boundary.
        const cut = excess + (excess % 2);
        this.chunks[0] = oldest.subarray(cut);
        this.bytes -= cut;
      }
    }
  }

  /** The newest `bytes` bytes (rounded down to whole samples), oldest first. */
  tail(bytes: number): Buffer {
    const wanted = Math.min(bytes, this.bytes) & ~1;
    if (wanted <= 0) return Buffer.alloc(0);
    return Buffer.concat(this.chunks).subarray(this.bytes - wanted);
  }

  clear(): void {
    this.chunks = [];
    this.bytes = 0;
  }
}
