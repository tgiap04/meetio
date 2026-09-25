/**
 * Recording quality chosen before a session starts (US-43).
 * Source of truth: docs/data-model.md `meetings.recording_quality` (recording_quality enum).
 */
export const RecordingQuality = {
  STANDARD: 'standard',
  HIGH: 'high',
} as const;

export type RecordingQuality = (typeof RecordingQuality)[keyof typeof RecordingQuality];
