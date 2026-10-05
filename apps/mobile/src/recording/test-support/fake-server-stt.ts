import type { SttHandlers } from '../stt-engine';
import type { ChunkRecorder } from '../server-stt-ports';

/**
 * Test-only harness for `createServerSttEngine`: a scriptable recorder, controllable uploads
 * (each `transcribe` call waits until the test settles it) and a manual clock whose timers fire
 * in time order, with the engine's async work flushed after each one.
 */
export class FakeFatalUploadError extends Error {}

export interface PendingUpload {
  uri: string;
  language: string;
  upload: { ownerId: string; meetingId: string } | undefined;
  resolve(text: string): void;
  reject(error: Error): void;
}

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

export function createServerSttHarness() {
  let now = 1_000_000;
  const timers: { at: number; fn: () => void }[] = [];
  let fileCount = 0;
  const log = { opens: [] as { volume: boolean }[], begins: 0, finishes: 0, closes: 0, deleted: [] as string[] };
  const control = {
    level: -30 as number | null,
    openError: null as Error | null,
    beginError: null as Error | null,
    finishReturnsNull: false,
    /** While set, `finish()` waits for it — holds a rotation (or shutdown) half-way. */
    finishGate: null as Promise<void> | null,
    /** `verifyOwner` throws this while set. */
    ownerError: null as Error | null,
  };
  const uploads: PendingUpload[] = [];

  const recorder: ChunkRecorder = {
    open: async (options) => {
      log.opens.push(options);
      if (control.openError) throw control.openError;
    },
    begin: async () => {
      if (control.beginError) throw control.beginError;
      log.begins += 1;
    },
    finish: async () => {
      if (control.finishGate) await control.finishGate;
      log.finishes += 1;
      return control.finishReturnsNull ? null : `file:///cache/chunk-${(fileCount += 1)}.m4a`;
    },
    level: () => control.level,
    close: () => void (log.closes += 1),
  };

  const deps = {
    recorder,
    transcribe: (uri: string, language: string, upload?: { ownerId: string; meetingId: string }) =>
      new Promise<string>((resolve, reject) => void uploads.push({ uri, language, upload, resolve, reject })),
    verifyOwner: () => {
      if (control.ownerError) throw control.ownerError;
    },
    isFatal: (error: unknown) => error instanceof FakeFatalUploadError,
    deleteFile: async (uri: string) => void log.deleted.push(uri),
    now: () => now,
    schedule: (fn: () => void, ms: number) => {
      const timer = { at: now + ms, fn };
      timers.push(timer);
      return () => void timers.splice(timers.indexOf(timer), 1);
    },
  };

  /** Moves the clock, firing every timer that comes due on the way (including ones they schedule). */
  async function advance(ms: number) {
    const target = now + ms;
    for (;;) {
      const next = timers.filter((t) => t.at <= target).sort((a, b) => a.at - b.at)[0];
      if (!next) break;
      timers.splice(timers.indexOf(next), 1);
      now = next.at;
      next.fn();
      await flush();
    }
    now = target;
    await flush();
  }

  /** Records what the engine reports, in order. */
  function recordEvents() {
    const events: string[] = [];
    const handlers: SttHandlers = {
      onStart: () => void events.push('start'),
      onResult: (text, isFinal) => void events.push(`result:${isFinal ? 'final' : 'partial'}:${text}`),
      onError: (code) => void events.push(`error:${code}`),
      onEnd: () => void events.push('end'),
      onVolume: (value) => void events.push(`volume:${value}`),
      onGap: (ms) => void events.push(`gap:${ms}`),
    };
    return { events, handlers };
  }

  return { deps, log, control, uploads, advance, flush, recordEvents };
}
