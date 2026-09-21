import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AppIcon, type AppIconName } from '../icons/app-icon';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';

export interface SettingsRowProps {
  icon: AppIconName;
  label: string;
  value?: string;
  onPress?: () => void;
}

/** One row of screen-14's settings list — icon, label, value, trailing chevron. */
export function SettingsRow({ icon, label, value, onPress }: SettingsRowProps) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.row}>
      <View style={styles.iconWell}>
        <AppIcon color={colors.textMuted} name={icon} size={18} />
      </View>
      <View style={styles.textColumn}>
        <Text style={styles.label}>{label}</Text>
        {value ? <Text style={styles.value}>{value}</Text> : null}
      </View>
      <AppIcon color={colors.textMuted} name="chevronRight" size={20} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  iconWell: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textColumn: { flex: 1, gap: 2 },
  label: { ...typography.label, color: colors.text },
  value: { ...typography.caption, color: colors.textMuted },
});
