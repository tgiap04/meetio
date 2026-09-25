/**
 * Where the recording picks up sound (US-42).
 * Source of truth: docs/data-model.md `meetings.audio_source` (audio_source enum).
 */
export const AudioSource = {
  DEVICE_MIC: 'device_mic',
  EXTERNAL_BLUETOOTH: 'external_bluetooth',
} as const;

export type AudioSource = (typeof AudioSource)[keyof typeof AudioSource];
