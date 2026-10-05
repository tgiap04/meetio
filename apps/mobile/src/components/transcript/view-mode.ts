/** Phase 09: how the finished transcript shows a translated meeting. */
export type TranscriptViewMode = 'original' | 'translated' | 'both';

export const VIEW_MODE_OPTIONS: readonly { key: TranscriptViewMode; label: string }[] = [
  { key: 'original', label: 'Gốc' },
  { key: 'translated', label: 'Dịch' },
  { key: 'both', label: 'Song song' },
];
