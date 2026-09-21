import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';

export interface FilterChip {
  key: string;
  label: string;
}

export interface FilterChipRowProps {
  chips: FilterChip[];
  activeKey: string;
  onChange: (key: string) => void;
}

/** Horizontal filter pills — "Tất cả / Person / Project / Task" etc, screens 09/10/12/13. */
export function FilterChipRow({ chips, activeKey, onChange }: FilterChipRowProps) {
  return (
    <View style={styles.row}>
      {chips.map((chip) => {
        const active = chip.key === activeKey;
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            key={chip.key}
            onPress={() => onChange(chip.key)}
            style={[styles.chip, active && styles.chipActive]}
          >
            <Text style={[styles.label, active && styles.labelActive]}>{chip.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: {
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  label: { ...typography.caption, fontWeight: '600', color: colors.textMuted },
  labelActive: { color: colors.primaryText },
});
