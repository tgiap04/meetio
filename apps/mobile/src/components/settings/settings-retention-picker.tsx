import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';

export interface RetentionOption {
  label: string;
  days: number | null;
}

/** Fixed choice set (Phase 16 clarifications, retention_days). `null` means
 *  "no automatic deletion". */
export const RETENTION_OPTIONS: readonly RetentionOption[] = [
  { label: 'Không tự xóa', days: null },
  { label: '30 ngày', days: 30 },
  { label: '90 ngày', days: 90 },
  { label: '180 ngày', days: 180 },
  { label: '365 ngày', days: 365 },
];

export interface SettingsRetentionPickerProps {
  value: number | null;
  onChange: (days: number | null) => void;
}

/**
 * Replaces the earlier free-text "number of days" field with a fixed set of
 * options — the design decision recorded for Phase 16: retention is a
 * deliberate, bounded choice (`PATCH /users/me` with `retention_days`), not
 * an arbitrary number a user might mistype.
 */
export function SettingsRetentionPicker({ value, onChange }: SettingsRetentionPickerProps) {
  return (
    <View style={styles.container}>
      <View style={styles.chipRow}>
        {RETENTION_OPTIONS.map((option) => {
          const selected = option.days === value;
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected }}
              key={option.label}
              onPress={() => onChange(option.days)}
              style={[styles.chip, selected && styles.chipSelected]}
            >
              <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.explainer}>
        {value === null
          ? 'Cuộc họp không tự xóa theo thời gian.'
          : `Cuộc họp bị xóa hẳn sau ${value} ngày kể từ khi kết thúc, có thông báo nhắc trước 7 ngày.`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipSelected: { backgroundColor: colors.primaryTint, borderColor: colors.primary },
  chipLabel: { ...typography.caption, color: colors.textMuted },
  chipLabelSelected: { color: colors.primaryStrong, fontWeight: '600' },
  explainer: { ...typography.caption, color: colors.textMuted },
});
