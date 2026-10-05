import { SegmentedTabs } from './ui/segmented-tabs';
import { VIEW_MODE_OPTIONS, type TranscriptViewMode } from './transcript/view-mode';

export interface ViewModeSwitchProps {
  value: TranscriptViewMode;
  onChange: (mode: TranscriptViewMode) => void;
}

/** "Gốc / Dịch / Song song" — the three ways to read a translated meeting (Phase 09, US-19). */
export function ViewModeSwitch({ value, onChange }: ViewModeSwitchProps) {
  return <SegmentedTabs activeKey={value} items={[...VIEW_MODE_OPTIONS]} onChange={(key) => onChange(key as TranscriptViewMode)} />;
}
