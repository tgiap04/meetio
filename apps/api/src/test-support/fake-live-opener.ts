import type { LiveHandlers, LiveOpener, LiveSession } from '../ai/gemini-live.js';

export interface FakeLeg {
  handlers: LiveHandlers;
  sent: Buffer[];
  ended: boolean;
  closed: boolean;
}

/** A scripted stand-in for GeminiLiveClient: records what each session was sent, lets a test speak for it. */
export class FakeLiveOpener implements LiveOpener {
  readonly model = 'fake-live';
  readonly legs: FakeLeg[] = [];
  /** Opens fail with this error while set. */
  failOpen: Error | null = null;
  configured = true;
  /** While set, `open` waits for it — holds a start half-way. */
  openGate: Promise<void> | null = null;
  /** Set to make `endAudio` produce this final (as Gemini settling its last words). */
  finalOnEnd: string | null = null;

  isConfigured(): boolean {
    return this.configured;
  }

  async open(_language: string, handlers: LiveHandlers): Promise<LiveSession> {
    if (this.openGate) await this.openGate;
    if (this.failOpen) throw this.failOpen;
    const leg: FakeLeg = { handlers, sent: [], ended: false, closed: false };
    this.legs.push(leg);
    return {
      sendAudio: (pcm) => void leg.sent.push(pcm),
      endAudio: () => {
        leg.ended = true;
        if (this.finalOnEnd) handlers.onFinal(this.finalOnEnd);
      },
      close: () => {
        leg.closed = true;
      },
    };
  }
}
