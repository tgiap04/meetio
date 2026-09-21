import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';

export interface RadioRowProps {
  label: string;
  description?: string;
  selected: boolean;
  onPress: () => void;
}

/**
 * One row of the "Nguồn âm thanh" card. The crop draws two affordances on
 * the selected row — the filled radio circle on the left AND a small orange
 * dot on the right — both are reproduced here; see phase-04 Key Insight #2.
 */
export function RadioRow({ label, description, selected, onPress }: RadioRowProps) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={styles.row}
    >
      <View style={[styles.radioOuter, selected && styles.radioOuterSelected]}>
        {selected ? <View style={styles.radioInner} /> : null}
      </View>
      <View style={styles.textColumn}>
        <Text style={styles.label}>{label}</Text>
        {description ? <Text style={styles.description}>{description}</Text> : null}
      </View>
      {selected ? <View style={styles.trailingDot} testID="radio-row-trailing-dot" /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  radioOuter: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOuterSelected: { borderColor: colors.primary },
  radioInner: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.primary },
  textColumn: { flex: 1, gap: 2 },
  label: { ...typography.label, color: colors.text },
  description: { ...typography.caption, color: colors.textMuted },
  trailingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary },
});
