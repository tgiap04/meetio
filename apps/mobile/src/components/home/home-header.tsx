import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { AppIcon } from '../icons/app-icon';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';

export interface HomeHeaderProps {
  /** `meQuery.data.user.display_name` — real, not a fixture. */
  displayName: string;
}

/**
 * Screen-04 masthead: logo mark + "Meetio" wordmark, the crown badge, the
 * greeting, and the static subtitle paragraph. The crown has no destination
 * anywhere in the design (see phase-03 hand-back) — it is deliberately not a
 * `Pressable` and carries an `accessibilityLabel` instead of a role, so it
 * reads as decorative rather than as a broken tap target.
 */
export function HomeHeader({ displayName }: HomeHeaderProps) {
  return (
    <View style={styles.container}>
      <View style={styles.brandRow}>
        <View style={styles.brandMark}>
          <LinearGradient
            colors={[colors.primaryGradientFrom, colors.primaryGradientTo]}
            end={{ x: 1, y: 1 }}
            start={{ x: 0, y: 0 }}
            style={styles.logoTile}
          >
            <AppIcon color={colors.primaryText} name="waveform" size={20} />
          </LinearGradient>
          <Text style={styles.wordmark}>Meetio</Text>
        </View>
        <View accessibilityLabel="Tài khoản cao cấp" style={styles.crownBadge}>
          <AppIcon color={colors.primary} name="crown" size={22} />
        </View>
      </View>

      <Text style={styles.greeting}>Chào buổi sáng,{'\n'}{displayName} 👋</Text>
      <Text style={styles.subtitle}>
        Ghi âm cuộc họp, nhận diện, dịch thuật và xây dựng tri thức từ cuộc họp của bạn.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 16 },
  brandRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brandMark: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logoTile: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  wordmark: { ...typography.title, color: colors.text },
  crownBadge: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  greeting: { ...typography.heading, color: colors.text },
  subtitle: { ...typography.body, color: colors.textMuted },
});
