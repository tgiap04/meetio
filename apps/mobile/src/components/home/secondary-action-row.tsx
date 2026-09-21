import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AppIcon, type AppIconName } from '../icons/app-icon';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';

export interface SecondaryActionRowProps {
  icon: AppIconName;
  label: string;
  /**
   * Omitted for a row that has no destination in the design (screen-04's
   * "Nhập từ file âm thanh" / "Kết nối thiết bị khác"). Without it the row
   * renders as a plain `View`, not a `Pressable` — visibly present, but
   * genuinely inert rather than a dead tap target.
   */
  onPress?: () => void;
}

/** One of the two secondary rows beneath the home CTA. */
export function SecondaryActionRow({ icon, label, onPress }: SecondaryActionRowProps) {
  const content = (
    <>
      <View style={styles.iconWell}>
        <AppIcon color={colors.textMuted} name={icon} size={18} />
      </View>
      <Text style={styles.label}>{label}</Text>
    </>
  );

  if (!onPress) {
    return <View style={styles.row}>{content}</View>;
  }

  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.row}>
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.background,
    borderRadius: 12,
    padding: 14,
  },
  iconWell: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { ...typography.label, color: colors.text },
});
