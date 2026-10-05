/** Real-time PCM16 16 kHz mono. */
const BYTES_PER_MS = 32;

export interface Uplink {
  /** Adds converted samples; full frames go out at once when online. */
  push(samples: Int16Array): void;
  /** Online: send what is buffered (also a partial frame at the end of the recording). Offline: keep buffering. */
  setOnline(online: boolean): void;
  /** Sends the buffered remainder, whatever its size. */
  flush(): void;
  /** Audio dropped since the last call because the backlog overflowed, in ms. */
  takeDroppedMs(): number;
}

/**
 * Batches the microphone's small buffers into `frameMs` frames, and while the link is down keeps
 * up to `maxBacklogMs` of audio to replay on reconnect (the server accepts a few seconds of burst).
 * Anything older is dropped and counted, so the transcript can show the gap.
 */
export function createUplink(send: (frame: ArrayBuffer) => void, frameMs: number, maxBacklogMs: number): Uplink {
  const frameBytes = frameMs * BYTES_PER_MS;
  let queue: Int16Array[] = [];
  let queued = 0; // bytes
  let online = true;
  let droppedBytes = 0;

  const drain = (all: boolean) => {
    if (queued === 0 || (!all && queued < frameBytes)) return;
    const joined = new Int16Array(queued / 2);
    let at = 0;
    for (const part of queue) {
      joined.set(part, at);
      at += part.length;
    }
    queue = [];
    queued = 0;
    const whole = all ? joined.length : Math.floor(joined.length / (frameBytes / 2)) * (frameBytes / 2);
    for (let from = 0; from < whole; from += frameBytes / 2) {
      send(joined.slice(from, Math.min(whole, from + frameBytes / 2)).buffer as ArrayBuffer);
    }
    if (whole < joined.length) {
      queue = [joined.slice(whole)];
      queued = (joined.length - whole) * 2;
    }
  };

  const trim = () => {
    const limit = maxBacklogMs * BYTES_PER_MS;
    while (queued > limit && queue.length > 0) {
      const oldest = queue[0];
      const excess = Math.min(queued - limit, oldest.length * 2);
      const cut = Math.ceil(excess / 2);
      droppedBytes += cut * 2;
      queued -= cut * 2;
      if (cut >= oldest.length) queue.shift();
      else queue[0] = oldest.slice(cut);
    }
  };

  return {
    push(samples) {
      if (samples.length === 0) return;
      queue.push(samples);
      queued += samples.length * 2;
      if (online) drain(false);
      else trim();
    },
    setOnline(next) {
      online = next;
      if (online) drain(false);
    },
    flush() {
      if (online) drain(true);
    },
    takeDroppedMs() {
      const ms = Math.round(droppedBytes / BYTES_PER_MS);
      droppedBytes = 0;
      return ms;
    },
  };
}
