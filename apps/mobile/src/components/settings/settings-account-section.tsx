import { StyleSheet, Switch, Text, View } from 'react-native';
import { SectionHeading } from '../ui/section-heading';
import { SurfaceCard } from '../ui/surface-card';
import { DevResetButton } from '../dev/dev-reset-button';
import { PrimaryButton } from '../primary-button';
import { TextField } from '../text-field';
import { SettingsRetentionPicker } from './settings-retention-picker';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';

export interface SettingsAccountSectionProps {
  retentionDays: number | null;
  onRetentionDaysChange: (days: number | null) => void;
  notificationsEnabled: boolean;
  onToggleNotifications: (enabled: boolean) => void;
  /** US-30 — bound to `NotificationSetting.MEETING_READY_PUSH`, distinct from
   *  the pre-existing generic `notificationsEnabled` toggle above. */
  meetingReadyPushEnabled: boolean;
  onToggleMeetingReadyPush: (enabled: boolean) => void;
  onLogoutPress: () => void;
  logoutLoading: boolean;
  deletePassword: string;
  onDeletePasswordChange: (value: string) => void;
  onDeleteAccountPress: () => void;
  deleteAccountLoading: boolean;
}

/**
 * The five working controls the design does not draw, restyled into the
 * same card idiom and placed below "Về Meetio" — see phase-12's key insight
 * #1. Every mutation call here is the pre-existing one from `settings.tsx`,
 * moved rather than rewritten.
 */
export function SettingsAccountSection({
  retentionDays,
  onRetentionDaysChange,
  notificationsEnabled,
  onToggleNotifications,
  meetingReadyPushEnabled,
  onToggleMeetingReadyPush,
  onLogoutPress,
  logoutLoading,
  deletePassword,
  onDeletePasswordChange,
  onDeleteAccountPress,
  deleteAccountLoading,
}: SettingsAccountSectionProps) {
  return (
    <View style={styles.container}>
      <SectionHeading title="Tài khoản" />

      <SurfaceCard style={styles.card}>
        <Text style={styles.rowLabel}>Lưu trữ</Text>
        <SettingsRetentionPicker onChange={onRetentionDaysChange} value={retentionDays} />
      </SurfaceCard>

      <SurfaceCard style={[styles.card, styles.row]}>
        <Text style={styles.rowLabel}>Thông báo</Text>
        <Switch onValueChange={onToggleNotifications} value={notificationsEnabled} />
      </SurfaceCard>

      <SurfaceCard style={[styles.card, styles.row]}>
        <Text style={styles.rowLabel}>Thông báo khi phân tích xong</Text>
        <Switch onValueChange={onToggleMeetingReadyPush} value={meetingReadyPushEnabled} />
      </SurfaceCard>

      <PrimaryButton label="Đăng xuất" loading={logoutLoading} onPress={onLogoutPress} />

      <SurfaceCard style={styles.card}>
        <TextField
          label="Mật khẩu (để xóa tài khoản)"
          onChangeText={onDeletePasswordChange}
          secureTextEntry
          value={deletePassword}
        />
        <PrimaryButton
          label="Xóa tài khoản"
          loading={deleteAccountLoading}
          onPress={onDeleteAccountPress}
        />
      </SurfaceCard>

      <DevResetButton />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 12 },
  card: { gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowLabel: { ...typography.label, color: colors.text },
});
