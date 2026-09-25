/**
 * Where the recording picks up sound (US-42).
 * Mirrors PG enum `audio_source` (see docs/data-model.md §2).
 */
export enum AudioSource {
  DEVICE_MIC = 'device_mic',
  EXTERNAL_BLUETOOTH = 'external_bluetooth',
}
