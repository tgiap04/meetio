import type { Scheduler } from './restart-loop';

/**
 * What the streaming engine (server-stream-stt-engine.ts) needs from the outside world — the
 * microphone as PCM, and the socket to the server — so the engine stays pure and testable.
 */

/** One buffer from the microphone, as `AudioStream` reports it. */
export interface PcmBuffer {
  /** Little-endian int16 samples, interleaved when `channels` > 1. */
  data: ArrayBuffer;
  sampleRate: number;
  channels: number;
}

export interface PcmSource {
  /** Checks permission, configures the audio session and starts delivering buffers. Throws `ServerSttError`. */
  start(onBuffer: (buffer: PcmBuffer) => void): Promise<void>;
  stop(): void;
}

/** A stream start the server (or the network) refused — `code` is the server's, or `NETWORK`. */
export class StreamStartError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export interface StreamChannelEvents {
  onPartial(text: string): void;
  onFinal(text: string): void;
  /** The server ended the stream for good (AI unavailable, quota, replaced…). */
  onFatal(code: string): void;
  /** The connection dropped without the server saying why. */
  onDown(): void;
}

export interface StreamChannel {
  /** Connects, authenticates and starts a server-side stream. Rejects with `StreamStartError`. */
  open(params: { language: string; meetingId?: string }, events: StreamChannelEvents): Promise<void>;
  send(pcm: ArrayBuffer): void;
  /** Ends the stream; resolves once the server flushed the last words. Rejects on timeout or a dead link. */
  end(): Promise<void>;
  close(): void;
}

export interface ServerStreamSttDeps {
  mic: PcmSource;
  channel: StreamChannel;
  /** Throws (anything) when the signed-in user is not `ownerId` — checked before start and before every reconnect. */
  verifyOwner?(ownerId: string): void;
  schedule: Scheduler;
  /** Audio per `stt_audio` frame. Default 150 ms. */
  frameMs?: number;
  /** How long `stop()` waits for the server to flush the last words. Default 4 s. */
  flushTimeoutMs?: number;
  /** Waits between reconnect attempts; its length is the number of attempts. Default 1 s, 2 s, 4 s. */
  reconnectDelaysMs?: number[];
  /** Audio kept while reconnecting; older audio is dropped and reported as a gap. Default 4 s. */
  maxBacklogMs?: number;
  /** Minimum time between `onVolume` events. Default 150 ms. */
  meterIntervalMs?: number;
  now: () => number;
}

/** The error code the engine reports when the stream cannot work — the fallback engine reacts to it. */
export const STREAM_FAILED = 'stream-failed' as const;
