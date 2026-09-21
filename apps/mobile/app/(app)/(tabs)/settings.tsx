import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text } from 'react-native';
import { ScreenSurface } from '../../../src/components/ui/screen-surface';
import { router } from 'expo-router';
import { useMeQuery } from '../../../src/hooks/use-me-query';
import {
  useDeleteAccountMutation,
  useUpdateMeMutation,
} from '../../../src/hooks/use-account-mutations';
import { useLogoutMutation } from '../../../src/hooks/use-auth-mutations';
import { getErrorMessage } from '../../../src/api/error-messages';
import { LoadingState } from '../../../src/components/loading-state';
import { ErrorState } from '../../../src/components/error-state';
import { SettingsProfileHeader } from '../../../src/components/settings/settings-profile-header';
import { SettingsMockRows } from '../../../src/components/settings/settings-mock-rows';
import { SettingsAboutSection } from '../../../src/components/settings/settings-about-section';
import { SettingsAccountSection } from '../../../src/components/settings/settings-account-section';
import { SETTINGS_ENTRIES, ABOUT_MEETIO_ENTRIES } from '../../../src/mocks';
import { RECORDING_SETUP_ROUTE } from '../../../src/navigation/app-routes';
import { colors } from '../../../src/theme/colors';
import { typography } from '../../../src/theme/typography';

/**
 * Settings tab (screen-14). Half of this screen is real, half is mock — do
 * not assume either:
 *
 * - REAL: `useMeQuery`'s pending/error branches, `SettingsProfileHeader`
 *   (`display_name` / `email` from `/me`), and everything in
 *   `SettingsAccountSection` — retention days, the notifications switch,
 *   logout, delete account, and `DevResetButton`, all still wired to the
 *   same mutations this screen had before the restyle.
 * - MOCK: `SettingsMockRows` (`SETTINGS_ENTRIES`) and `SettingsAboutSection`
 *   (`ABOUT_MEETIO_ENTRIES`) — screen-14's own five rows and its "Về Meetio"
 *   links. The design draws none of the real controls above, so they are
 *   restyled into the same card idiom and placed below "Về Meetio" under a
 *   "Tài khoản" heading instead of being dropped. See
 *   `plans/260921-1012-mobile-ui-screens-from-design/phase-12-settings-tab-restyle.md`.
 */
export default function SettingsScreen() {
  const meQuery = useMeQuery();
  const updateMeMutation = useUpdateMeMutation();
  const deleteAccountMutation = useDeleteAccountMutation();
  const logoutMutation = useLogoutMutation();

  const [retentionDaysInput, setRetentionDaysInput] = useState<string | null>(null);
  const [deletePassword, setDeletePassword] = useState('');
  // `null` means "not touched this session" — the switch then reflects what the
  // server actually has. An older comment here claimed the saved preference had
  // no read path and hardcoded `true`; that is no longer true. `PublicUser`
  // (packages/shared/src/auth/user.types.ts) carries
  // `notification_settings: Record<string, boolean>` and documents itself as
  // the read-back for `UpdateMeRequest.notification_settings`. Defaulting to
  // "on" showed the switch enabled even for a user who had turned it off, until
  // they touched it.
  const [notificationsOverride, setNotificationsOverride] = useState<boolean | null>(null);

  if (meQuery.isPending) {
    return <LoadingState />;
  }

  if (meQuery.isError) {
    return (
      <ErrorState message={getErrorMessage(meQuery.error)} onRetry={() => meQuery.refetch()} />
    );
  }

  const { user } = meQuery.data;
  const retentionDaysValue = retentionDaysInput ?? user.retention_days?.toString() ?? '';
  // Same read-then-override shape as `retentionDaysValue` above. `?? true`
  // covers a user who has never saved a preference — `notification_settings`
  // defaults to `{}` server-side, so `enabled` is simply absent.
  //
  // The `?.` is deliberate and not redundant with the type. `PublicUser` marks
  // `notification_settings` required, but this value arrives over the wire from
  // a server this code does not control — a type declaration is a claim about
  // the response, not a guarantee of it. An older payload, or a partial one,
  // would otherwise crash the whole Settings screen on a property read.
  const notificationsEnabled = notificationsOverride ?? user.notification_settings?.enabled ?? true;

  function commitRetentionDays() {
    const parsed = retentionDaysInput === '' ? null : Number(retentionDaysInput);
    if (retentionDaysInput !== null && (parsed === null || Number.isNaN(parsed))) {
      Alert.alert('Giá trị không hợp lệ', 'Số ngày lưu trữ phải là một số.');
      return;
    }
    updateMeMutation.mutate({ retention_days: parsed });
  }

  function toggleNotifications(enabled: boolean) {
    setNotificationsOverride(enabled);
    updateMeMutation.mutate({ notification_settings: { enabled } });
  }

  function handleDeleteAccount() {
    Alert.alert('Xóa tài khoản', 'Hành động này không thể hoàn tác. Bạn chắc chắn chứ?', [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Xóa',
        style: 'destructive',
        onPress: () => deleteAccountMutation.mutate({ password: deletePassword }),
      },
    ]);
  }

  function handleRecordingSettingsPress() {
    router.push(RECORDING_SETUP_ROUTE);
  }

  return (
    <ScreenSurface>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Cài đặt</Text>

        <SettingsProfileHeader displayName={user.display_name} email={user.email} />

        <SettingsMockRows
          entries={SETTINGS_ENTRIES}
          onRecordingSettingsPress={handleRecordingSettingsPress}
        />

        <SettingsAboutSection entries={ABOUT_MEETIO_ENTRIES} />

        <SettingsAccountSection
          deleteAccountLoading={deleteAccountMutation.isPending}
          deletePassword={deletePassword}
          logoutLoading={logoutMutation.isPending}
          notificationsEnabled={notificationsEnabled}
          onDeleteAccountPress={handleDeleteAccount}
          onDeletePasswordChange={setDeletePassword}
          onLogoutPress={() => logoutMutation.mutate()}
          onRetentionDaysBlur={commitRetentionDays}
          onRetentionDaysChange={setRetentionDaysInput}
          onToggleNotifications={toggleNotifications}
          retentionDaysValue={retentionDaysValue}
        />
      </ScrollView>
    </ScreenSurface>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, gap: 16, paddingBottom: 32 },
  title: { ...typography.title, color: colors.text },
});
