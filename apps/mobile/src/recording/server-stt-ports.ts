import type { Scheduler } from './restart-loop';

/**
 * What the server STT engine (server-stt-engine.ts) needs from the outside world, plus the pure
 * level mapping — kept apart so the engine stays small and the native adapter and test fakes
 * share one definition.
 */
export class ServerSttError extends Error {
  /** `not-allowed` (microphone permission), `audio-capture` (recorder failure) `owner-changed` (signed-in user is not the meeting's owner) or `stream-failed` (the Phase 19 stream cannot work; the fallback engine reacts) — see engine-problems.ts. */
  constructor(
    readonly code: 'not-allowed' | 'audio-capture' | 'owner-changed' | 'stream-failed',
    message: string,
  ) {
    super(message);
  }
}

export interface ChunkRecorder {
  /** Checks permission, configures the audio session. Throws `ServerSttError`. */
  open(options: { volume: boolean }): Promise<void>;
  /** Starts recording a fresh chunk file. */
  begin(): Promise<void>;
  /** Stops the current chunk; its file URI, or `null` when no file was produced. */
  finish(): Promise<string | null>;
  /** Input level in dBFS (-160 … 0), `null` when unavailable. */
  level(): number | null;
  close(): void;
}

export interface ServerSttDeps {
  recorder: ChunkRecorder;
  /** Uploads one chunk and returns its text ('' = no speech). Rejects when it cannot. */
  transcribe(uri: string, language: string, upload?: { ownerId: string; meetingId: string }): Promise<string>;
  /** Throws (anything) when the signed-in user is not `ownerId` — checked before the microphone opens. */
  verifyOwner?(ownerId: string): void;
  /** An upload error that must stop recognition (another account is signed in) instead of becoming a gap. */
  isFatal?(error: unknown): boolean;
  deleteFile(uri: string): Promise<void>;
  now: () => number;
  schedule: Scheduler;
  chunkMs?: number;
  meterIntervalMs?: number;
  /** Chunks waiting for upload beyond this are dropped (reported as gaps) — bounds disk use when offline. */
  maxPendingChunks?: number;
}

/** Quieter than this reads as silence on the -2…10 scale; speech sits around -40…-10 dBFS. */
const METER_FLOOR_DB = -60;

/** dBFS → the -2 (silence) … 10 (loud) scale the waveform expects. */
export function dbfsToVolume(dbfs: number): number {
  if (!Number.isFinite(dbfs)) return -2;
  const clamped = Math.min(0, Math.max(METER_FLOOR_DB, dbfs));
  return -2 + ((clamped - METER_FLOOR_DB) / -METER_FLOOR_DB) * 12;
}
