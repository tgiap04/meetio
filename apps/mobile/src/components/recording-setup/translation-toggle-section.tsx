import { StyleSheet, Switch, Text, View } from 'react-native';
import { SettingsSelectRow } from './settings-select-row';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';

export interface TranslationToggleSectionProps {
  enabled: boolean;
  onToggle: (value: boolean) => void;
  targetLabel: string;
}

/**
 * "Dịch thuật" heading + `Switch`, and the "Dịch sang …" target row beneath
 * it. The target row has no alternate value to cycle through (see
 * `SettingsSelectRow`'s doc comment), so it is dimmed rather than hidden
 * when the switch is off — hiding it would jump the layout, which the crop
 * gives no evidence for (phase-04 Key Insight #3).
 */
export function TranslationToggleSection({ enabled, onToggle, targetLabel }: TranslationToggleSectionProps) {
  return (
    <View style={styles.section}>
      <View style={styles.headingRow}>
        <Text style={styles.heading}>Dịch thuật</Text>
        <Switch
          accessibilityLabel="Dịch thuật"
          onValueChange={onToggle}
          thumbColor={colors.background}
          trackColor={{ false: colors.border, true: colors.primary }}
          value={enabled}
        />
      </View>
      <SettingsSelectRow dimmed={!enabled} value={targetLabel} />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 12 },
  headingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heading: { ...typography.sectionTitle, color: colors.text },
});
