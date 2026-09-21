import { StyleSheet, Text, View } from 'react-native';
import { InitialsAvatar } from '../ui/initials-avatar';
import { deriveInitials } from './derive-initials';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';

export interface SettingsProfileHeaderProps {
  /** `meQuery.data.user.display_name` — real, not a fixture. */
  displayName: string;
  /** `meQuery.data.user.email` — real, not a fixture. */
  email: string;
}

/** Screen-14's profile row: initials avatar, display name, email — all real `/me` data. */
export function SettingsProfileHeader({ displayName, email }: SettingsProfileHeaderProps) {
  return (
    <View style={styles.row}>
      <InitialsAvatar haloColor={colors.primaryTint} initials={deriveInitials(displayName)} size={48} />
      <View style={styles.textColumn}>
        <Text style={styles.name}>{displayName}</Text>
        <Text style={styles.email}>{email}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  textColumn: { gap: 2 },
  name: { ...typography.label, fontSize: 17, color: colors.text },
  email: { ...typography.caption, color: colors.textMuted },
});
