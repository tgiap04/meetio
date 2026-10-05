import type { SttLanguage } from './stt.types';

/**
 * Streaming recognition (Phase 19, docs/api-spec.md §8b). The app streams raw PCM over socket.io and
 * the server relays it to one Gemini Live session per socket. Audio is never stored or logged.
 */
export const STT_STREAM_NAMESPACE = '/stt-stream';

export const SttStreamClientEvent = {
  START: 'stt_start',
  AUDIO: 'stt_audio',
  STOP: 'stt_stop',
} as const;

export const SttStreamServerEvent = {
  PARTIAL: 'stt_partial',
  FINAL: 'stt_final',
  ERROR: 'stt_error',
} as const;

/** The only audio format the stream accepts: signed 16-bit little-endian PCM, mono. */
export const STT_STREAM_SAMPLE_RATE = 16_000;
export const STT_STREAM_MIME_TYPE = `audio/pcm;rate=${STT_STREAM_SAMPLE_RATE}`;
/** One `stt_audio` frame: the app batches 100-200 ms (3.2-6.4 KB); anything above this is refused. */
export const STT_STREAM_MAX_FRAME_BYTES = 65_536;

/** Why a stream ended or could not start. Codes shared with REST errors keep their REST meaning. */
export const SttStreamErrorCode = {
  CONSENT_REQUIRED: 'CONSENT_REQUIRED',
  QUOTA_EXCEEDED: 'QUOTA_EXCEEDED',
  AI_SERVICE_UNAVAILABLE: 'AI_SERVICE_UNAVAILABLE',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  /** The access token the stream was opened with has expired; refresh it, reconnect and start again. */
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  /** The same user opened a newer stream; this (older) one was closed. */
  STREAM_REPLACED: 'STREAM_REPLACED',
  /** `stt_audio` / `stt_stop` before a successful `stt_start`. */
  STREAM_NOT_STARTED: 'STREAM_NOT_STARTED',
  /** Frames arrive faster than real time allows, or one frame is over the size cap. */
  RATE_LIMITED: 'RATE_LIMITED',
} as const;
export type SttStreamErrorCode = (typeof SttStreamErrorCode)[keyof typeof SttStreamErrorCode];

export interface SttStreamStartPayload {
  language: SttLanguage;
  /** Only attributes Gemini usage; ignored when it is not the caller's own meeting. */
  meeting_id?: string;
}

export type SttStreamAck = { ok: true } | { ok: false; error: { code: SttStreamErrorCode; message: string } };

/** `stt_partial` (replaces the previous partial) and `stt_final` (a settled stretch of speech). */
export interface SttStreamTextPayload {
  text: string;
}

export interface SttStreamErrorPayload {
  code: SttStreamErrorCode;
  message: string;
}
