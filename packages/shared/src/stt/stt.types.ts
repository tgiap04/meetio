/**
 * Server-side recognition (docs/api-spec.md — POST /stt/transcribe). Used only when the device
 * cannot recognise speech on-device: the app records ~10s chunks and the server has Gemini
 * transcribe each one. The audio is never stored server-side (clarifications 2026-10-05).
 */

/** Recognition languages accepted by the server — same set the app offers (RECORDING_LANGUAGES). */
export const STT_LANGUAGES = ['vi-VN', 'en-US'] as const;
export type SttLanguage = (typeof STT_LANGUAGES)[number];

/** Audio container types the server accepts for one chunk (expo-audio records AAC in .m4a). */
export const STT_AUDIO_MIME_TYPES = ['audio/mp4', 'audio/m4a', 'audio/x-m4a', 'audio/aac', 'audio/mpeg', 'audio/wav', 'audio/webm'] as const;

/** Upper bound of one uploaded chunk. ~10s of AAC at 64 kbps is ~80 KB; this leaves headroom. */
export const STT_MAX_AUDIO_BYTES = 1_000_000;

/** Length of one chunk the app records before sending it. */
export const STT_CHUNK_MS = 10_000;

/**
 * `multipart/form-data` fields of POST /stt/transcribe besides the `audio` file part.
 * `meeting_id` only attributes Gemini usage to the meeting; it is optional because the meeting
 * may not exist on the server yet when the first chunk is sent.
 */
export interface TranscribeAudioFields {
  language: SttLanguage;
  meeting_id?: string;
}

export interface TranscribeAudioResponse {
  /** Verbatim transcript of the chunk; empty string when the chunk held no speech. */
  text: string;
}
