import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AppIcon } from '../icons/app-icon';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';

export interface StartRecordingCardProps {
  onPress: () => void;
}

/**
 * The screen-04 primary CTA — "Bắt đầu ghi âm / Từ thiết bị này". Routing is
 * the caller's decision (consent gate vs. recording-setup); this component
 * only renders the card and forwards the press.
 */
export function StartRecordingCard({ onPress }: StartRecordingCardProps) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.card}>
      <View style={styles.iconWell}>
        <AppIcon color={colors.primary} name="mic" size={24} />
      </View>
      <View style={styles.textColumn}>
        <Text style={styles.title}>Bắt đầu ghi âm</Text>
        <Text style={styles.subtitle}>Từ thiết bị này</Text>
      </View>
      <AppIcon color={colors.primaryText} name="chevronRight" size={22} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: colors.primary,
    borderRadius: 16,
    padding: 16,
  },
  iconWell: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textColumn: { flex: 1, gap: 2 },
  title: { ...typography.label, fontSize: 17, color: colors.primaryText },
  subtitle: { ...typography.caption, color: colors.primaryText, opacity: 0.85 },
});
