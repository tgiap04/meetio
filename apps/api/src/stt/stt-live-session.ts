import { Logger } from '@nestjs/common';
import { SttStreamErrorCode, type SttLanguage } from '@meetio/shared';
import type { LiveOpener } from '../ai/gemini-live.js';
import { AudioRingBuffer } from './stt-audio-ring-buffer.js';
import { SeamFilter } from './stt-seam-filter.js';
import { BYTES_PER_MS, POLL_MS, awaitSettled, closeLeg, endAudio, QUIET_MS, RECOVER_MIN_GAP_MS, SEAM_WORDS, UNOPENED, errorName, type Leg, type SttLiveOptions, type SttLiveSink } from './stt-live-leg.js';

export type { SttLiveOptions, SttLiveSink } from './stt-live-leg.js';

/**
 * One user's recognition stream over Gemini Live. Audio is forwarded as it arrives and kept for a
 * few seconds in RAM only. Because Gemini caps a session at 10 minutes, the session is rotated
 * before that: a new one opens, is replayed the last `overlapMs` of audio, and takes over while the
 * old one settles its last words; the new session's first finals are de-duplicated against what was
 * already delivered. A session that drops unexpectedly is reopened the same way. Neither audio nor
 * transcript text is ever logged.
 */
export class SttLiveSession {
  private readonly logger = new Logger(SttLiveSession.name);
  private readonly ring: AudioRingBuffer;
  private readonly seam = new SeamFilter();
  private readonly legs = new Set<Leg>();
  private active: Leg | null = null;
  private working: Promise<void> | null = null;
  private timer: NodeJS.Timeout | null = null;
  private lastTextAt = 0;
  private lastRecoverAt = 0;
  private stopping = false;
  private disposed = false;

  constructor(
    private readonly opener: LiveOpener,
    private readonly language: SttLanguage,
    private readonly sink: SttLiveSink,
    private readonly options: SttLiveOptions,
  ) {
    this.ring = new AudioRingBuffer(options.ringMs * BYTES_PER_MS);
  }

  /** Opens the first session; rejects (AiServiceUnavailableError) when none can be opened. */
  async start(): Promise<void> {
    this.active = await this.openLeg(false);
    this.armRotation(this.active);
  }

  push(frame: Buffer): void {
    if (this.disposed || this.stopping) return;
    this.ring.push(frame);
    const leg = this.active;
    if (!leg || leg.closed) return;
    try {
      leg.session.sendAudio(frame);
    } catch {
      // The socket is gone; its close event starts the recovery.
    }
  }

  /** Ends the audio, waits (bounded) for the last words to settle, then closes everything. */
  async stop(): Promise<void> {
    if (this.disposed) return;
    this.stopping = true;
    this.clearTimer();
    await this.working;
    const leg = this.active;
    if (leg && !leg.closed) {
      endAudio(leg);
      await awaitSettled(leg, this.options.flushMs);
      this.settle(leg);
    }
    this.dispose();
  }

  /** Immediate teardown (disconnect, replaced stream). Emits nothing. */
  dispose(): void {
    this.disposed = true;
    this.clearTimer();
    for (const leg of this.legs) closeLeg(leg);
    this.legs.clear();
    this.ring.clear();
  }

  private async openLeg(held: boolean): Promise<Leg> {
    const leg: Leg = { session: UNOPENED, openedAt: Date.now(), closed: false, pending: '', held: held ? [] : null, onSettled: null };
    leg.session = await this.opener.open(this.language, {
      onInterim: (text) => this.onText(leg, 'partial', text),
      onFinal: (text) => this.onText(leg, 'final', text),
      onGoAway: () => {
        if (leg === this.active) this.startWork(() => this.rotate());
      },
      onClose: () => this.onClose(leg),
    });
    if (this.disposed) {
      closeLeg(leg);
      throw new Error('session disposed');
    }
    this.legs.add(leg);
    this.lastTextAt = Date.now();
    return leg;
  }

  private onText(leg: Leg, kind: 'partial' | 'final', text: string): void {
    if (leg.held) leg.held.push([kind, text]);
    else this.deliver(leg, kind, text);
  }

  private deliver(leg: Leg, kind: 'partial' | 'final', text: string): void {
    if (this.disposed) return;
    this.lastTextAt = Date.now();
    if (kind === 'partial') {
      leg.pending = text;
      const out = this.seam.filterPartial(text);
      if (out) this.sink.partial(out);
      return;
    }
    leg.pending = '';
    const out = this.seam.filterFinal(text);
    if (out) {
      this.seam.noteEmitted(out);
      this.sink.final(out);
    }
    leg.onSettled?.();
  }

  private onClose(leg: Leg): void {
    leg.closed = true;
    leg.onSettled?.();
    if (this.disposed || this.stopping || leg !== this.active) return;
    this.startWork(() => this.recover());
  }

  /** Serialises rotation and recovery: only one runs at a time. */
  private startWork(job: () => Promise<void>): void {
    if (this.working || this.disposed || this.stopping) return;
    this.clearTimer();
    this.working = job()
      .catch((error: unknown) => this.fatal(error))
      .finally(() => {
        this.working = null;
      });
  }

  private async rotate(): Promise<void> {
    const old = this.active;
    if (!old) return;
    let next: Leg;
    try {
      next = await this.openLeg(true);
    } catch (error) {
      if (old.closed) throw error;
      // The old session still works: keep it and try again shortly rather than ending the stream.
      this.logger.warn(`Live rotation could not open a new session (${errorName(error)}); retrying`);
      this.timer = setTimeout(() => this.startWork(() => this.rotate()), POLL_MS * 4);
      return;
    }
    // From here audio goes to the new session, which first hears the last `overlapMs` again.
    const replay = this.ring.tail(this.options.overlapMs * BYTES_PER_MS);
    if (replay.length > 0) next.session.sendAudio(replay);
    this.active = next;
    if (!old.closed) {
      endAudio(old);
      await awaitSettled(old, this.options.flushMs);
      this.settle(old);
    }
    closeLeg(old);
    this.legs.delete(old);
    this.seam.begin(this.seam.tailWords(SEAM_WORDS));
    const held = next.held ?? [];
    next.held = null;
    for (const [kind, text] of held) this.deliver(next, kind, text);
    if (next.closed) return this.recover();
    this.armRotation(next);
  }

  private async recover(): Promise<void> {
    const dead = this.active;
    if (dead) this.settle(dead);
    const now = Date.now();
    if (now - this.lastRecoverAt < RECOVER_MIN_GAP_MS) {
      throw new Error('Live session keeps dropping');
    }
    this.lastRecoverAt = now;
    this.active = null;
    if (dead) {
      closeLeg(dead);
      this.legs.delete(dead);
    }
    const leg = await this.openLeg(false);
    // Everything heard since the drop, plus the overlap, is still in the ring buffer.
    const replay = this.ring.tail(this.ring.size);
    if (replay.length > 0) leg.session.sendAudio(replay);
    this.active = leg;
    this.seam.begin(this.seam.tailWords(SEAM_WORDS));
    if (leg.closed) throw new Error('Live session closed right after reopening');
    this.armRotation(leg);
  }

  private armRotation(leg: Leg): void {
    this.clearTimer();
    if (this.disposed || this.stopping) return;
    const wait = Math.max(0, leg.openedAt + this.options.rotateAfterMs - this.options.quietWindowMs - Date.now());
    this.timer = setTimeout(() => this.poll(leg), wait);
  }

  /** Rotates at the first pause once the window opens; at the deadline whatever is being said. */
  private poll(leg: Leg): void {
    if (leg !== this.active || this.working || this.disposed || this.stopping) return;
    const quiet = !leg.pending && Date.now() - this.lastTextAt >= QUIET_MS;
    if (quiet || Date.now() >= leg.openedAt + this.options.rotateAfterMs) {
      this.startWork(() => this.rotate());
      return;
    }
    this.timer = setTimeout(() => this.poll(leg), POLL_MS);
  }

  /** A partial Gemini never turned into a final is better kept than lost. */
  private settle(leg: Leg): void {
    if (leg.pending) this.deliver(leg, 'final', leg.pending);
  }

  private fatal(error: unknown): void {
    if (this.disposed) return;
    this.logger.warn(`Live stream failed (${errorName(error)})`);
    this.dispose();
    this.sink.fatal(SttStreamErrorCode.AI_SERVICE_UNAVAILABLE, 'Mất kết nối nhận diện giọng nói');
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}

