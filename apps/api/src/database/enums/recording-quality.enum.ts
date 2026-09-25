/**
 * Recording quality chosen before a session starts (US-43).
 * Mirrors PG enum `recording_quality` (see docs/data-model.md §2).
 */
export enum RecordingQuality {
  STANDARD = 'standard',
  HIGH = 'high',
}
