import { ServerSttError } from '../server-stt-ports';
import type { PcmBuffer, PcmSource, StreamChannel, StreamChannelEvents } from '../server-stream-stt-ports';
import { StreamStartError } from '../server-stream-stt-ports';
import type { SttHandlers } from '../stt-engine';

/**
 * Test-only harness for `createServerStreamSttEngine`: a scriptable microphone and server channel
 * and a manual clock whose timers fire in time order, with the engine's async work flushed after each.
 */
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

export function createStreamSttHarness() {
  let now = 1_000_000;
  const timers: { at: number; fn: () => void; cancelled: boolean }[] = [];
  const log = {
    sent: [] as Int16Array[],
    opens: [] as { language: string; meetingId?: string }[],
    micStarts: 0,
    micStops: 0,
    ends: 0,
    closes: 0,
  };
  const control = {
    micError: null as Error | null,
    /** While set, the microphone's `start()` waits for it — holds the engine in `starting`. */
    micGate: null as Promise<void> | null,
    /** The next `open()` calls reject (this many; `Infinity` = always) with `openError`, or a StreamStartError. */
    openFailures: 0,
    openError: null as Error | null,
    /** `end()` never settles while set — the flush times out. */
    endHangs: false,
    /** `end()` emits this final first, like the server flushing its last words. */
    finalOnEnd: null as string | null,
    ownerError: null as Error | null,
  };
  let onBuffer: ((b: PcmBuffer) => void) | null = null;
  let events: StreamChannelEvents | null = null;

  const mic: PcmSource = {
    start: async (cb) => {
      if (control.micGate) await control.micGate;
      if (control.micError) throw control.micError;
      log.micStarts += 1;
      onBuffer = cb;
    },
    stop: () => {
      log.micStops += 1;
      onBuffer = null;
    },
  };

  const channel: StreamChannel = {
    open: async (params, e) => {
      log.opens.push(params);
      if (control.openFailures > 0) {
        control.openFailures -= 1;
        throw control.openError ?? new StreamStartError('AI_SERVICE_UNAVAILABLE', 'down');
      }
      events = e;
    },
    send: (pcm) => void log.sent.push(new Int16Array(pcm)),
    end: async () => {
      log.ends += 1;
      if (control.finalOnEnd) events?.onFinal(control.finalOnEnd);
      if (control.endHangs) await new Promise(() => undefined);
    },
    close: () => void (log.closes += 1),
  };

  const collected: string[] = [];
  const handlers: SttHandlers = {
    onStart: () => collected.push('start'),
    onResult: (text, isFinal) => collected.push(`${isFinal ? 'final' : 'partial'}:${text}`),
    onError: (code) => collected.push(`error:${code}`),
    onEnd: () => collected.push('end'),
    onVolume: (v) => collected.push(`volume:${v.toFixed(1)}`),
    onGap: (ms) => collected.push(`gap:${ms}`),
  };

  const deps = {
    mic,
    channel,
    verifyOwner: () => {
      if (control.ownerError) throw control.ownerError;
    },
    schedule: (fn: () => void, ms: number) => {
      const timer = { at: now + ms, fn, cancelled: false };
      timers.push(timer);
      return () => void (timer.cancelled = true);
    },
    now: () => now,
  };

  return {
    deps,
    handlers,
    log,
    control,
    collected,
    /** 16 kHz mono int16 buffer of `ms` milliseconds, every sample = `level`. */
    pcm: (ms: number, level = 1000, sampleRate = 16_000): PcmBuffer => ({
      data: new Int16Array(Math.round((ms * sampleRate) / 1000)).fill(level).buffer as ArrayBuffer,
      sampleRate,
      channels: 1,
    }),
    mic: (b: PcmBuffer) => onBuffer?.(b),
    server: () => events!,
    micRunning: () => onBuffer !== null,
    /** Advances the clock, firing due timers in order, flushing async work after each. */
    async advance(ms: number) {
      const target = now + ms;
      for (;;) {
        await flush();
        const due = timers.filter((t) => !t.cancelled && t.at <= target).sort((a, b) => a.at - b.at)[0];
        if (!due) break;
        due.cancelled = true;
        now = Math.max(now, due.at);
        due.fn();
      }
      now = target;
      await flush();
    },
    flush,
    micDenied: () => new ServerSttError('not-allowed', 'denied'),
  };
}
