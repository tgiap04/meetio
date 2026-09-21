import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AppIcon } from '../icons/app-icon';
import { SurfaceCard } from '../ui/surface-card';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';

export interface SettingsSelectRowProps {
  value: string;
  /**
   * Absent means deliberately inert: the crop draws this row's chevron for
   * every one of "Ngôn ngữ" / "Dịch sang Tiếng Anh" / "Chế độ ghi âm", but
   * `RECORDING_SETTINGS_DEFAULTS` (P02's fixture) carries exactly one value
   * per field — no option list to advance through, and no picker screen
   * exists in this design sheet (phase-04 Key Insight #4). Inventing a list
   * to cycle would fabricate data this phase does not own. So this row
   * renders as a plain `View`, not a `Pressable`, whenever `onPress` is
   * omitted — visibly non-interactive rather than a chevron that lies.
   */
  onPress?: () => void;
  /** Dims the row without hiding it — used for the translation-target row
   *  when "Dịch thuật" is off (phase-04 Key Insight #3). */
  dimmed?: boolean;
}

/**
 * A single-value settings row with a trailing chevron, styled to match P01's
 * `SettingsRow` but without its mandatory icon slot — this design crop draws
 * no icon on these rows.
 */
export function SettingsSelectRow({ value, onPress, dimmed = false }: SettingsSelectRowProps) {
  const content = (
    <View style={[styles.row, dimmed && styles.rowDimmed]}>
      <Text style={styles.value}>{value}</Text>
      <AppIcon color={colors.textMuted} name="chevronRight" size={20} />
    </View>
  );

  return (
    <SurfaceCard style={styles.card}>
      {onPress ? (
        <Pressable accessibilityRole="button" onPress={onPress}>
          {content}
        </Pressable>
      ) : (
        content
      )}
    </SurfaceCard>
  );
}

const styles = StyleSheet.create({
  card: { paddingVertical: 14 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowDimmed: { opacity: 0.4 },
  value: { ...typography.body, color: colors.text },
});
