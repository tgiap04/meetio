import { StyleSheet } from 'react-native';
import { SettingsRow } from '../ui/settings-row';
import { SurfaceCard } from '../ui/surface-card';
import type { AppIconName } from '../icons/app-icon';
import type { SettingsEntry } from '../../mocks/types';

/**
 * `SettingsEntry.icon` (P02 fixture) is a plain string, deliberately kept
 * free of a P01 import — see `settings-entries.mock.ts`. Its values ('globe',
 * 'cpu', 'archive', …) are the underlying Feather glyphs, not `AppIconName`
 * keys, so this screen maps each row by its stable `id` to the semantic name
 * `AppIcon` actually expects.
 */
const ICON_BY_ENTRY_ID: Record<string, AppIconName> = {
  language: 'language',
  translation: 'translate',
  'recording-settings': 'micSettings',
  'ai-graphrag': 'aiEngine',
  storage: 'storage',
};

export interface SettingsMockRowsProps {
  entries: readonly SettingsEntry[];
  /** Routes "Cài đặt ghi âm" to screen 05; the phase's other four rows are inert. */
  onRecordingSettingsPress: () => void;
}

/** Screen-14's five top rows — mock content, one live destination. */
export function SettingsMockRows({ entries, onRecordingSettingsPress }: SettingsMockRowsProps) {
  return (
    <SurfaceCard style={styles.card}>
      {entries.map((entry) => (
        <SettingsRow
          icon={ICON_BY_ENTRY_ID[entry.id] ?? 'more'}
          key={entry.id}
          label={entry.label}
          onPress={entry.id === 'recording-settings' ? onRecordingSettingsPress : undefined}
          value={entry.value}
        />
      ))}
    </SurfaceCard>
  );
}

const styles = StyleSheet.create({
  card: { padding: 4, gap: 4 },
});
