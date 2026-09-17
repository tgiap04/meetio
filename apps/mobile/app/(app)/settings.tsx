import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useMeQuery } from '../../src/hooks/use-me-query';
import {
  useDeleteAccountMutation,
  useUpdateMeMutation,
} from '../../src/hooks/use-account-mutations';
import { useLogoutMutation } from '../../src/hooks/use-auth-mutations';
import { getErrorMessage } from '../../src/api/error-messages';
import { DevResetButton } from '../../src/components/dev/dev-reset-button';
import { LoadingState } from '../../src/components/loading-state';
import { ErrorState } from '../../src/components/error-state';
import { PrimaryButton } from '../../src/components/primary-button';
import { TextField } from '../../src/components/text-field';
import { colors } from '../../src/theme/colors';
import { typography } from '../../src/theme/typography';

/** Settings screen: profile, retention policy, notifications, delete account. */
export default function SettingsScreen() {
  const meQuery = useMeQuery();
  const updateMeMutation = useUpdateMeMutation();
  const deleteAccountMutation = useDeleteAccountMutation();
  const logoutMutation = useLogoutMutation();

  const [retentionDaysInput, setRetentionDaysInput] = useState<string | null>(null);
  const [deletePassword, setDeletePassword] = useState('');
  // `GetMeResponse` (packages/shared) does not currently expose the user's saved
  // notification preference — only `UpdateMeRequest` accepts one, write-only.
  // Tracked as a shared-type gap in this phase's hand-back rather than added
  // here (apps/mobile does not own packages/shared). Defaults to "on" until a
  // read path exists.
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);

  if (meQuery.isPending) {
    return <LoadingState />;
  }

  if (meQuery.isError) {
    return <ErrorState message={getErrorMessage(meQuery.error)} onRetry={() => meQuery.refetch()} />;
  }

  const { user } = meQuery.data;
  const retentionDaysValue = retentionDaysInput ?? (user.retention_days?.toString() ?? '');

  function commitRetentionDays() {
    const parsed = retentionDaysInput === '' ? null : Number(retentionDaysInput);
    if (retentionDaysInput !== null && (parsed === null || Number.isNaN(parsed))) {
      Alert.alert('Giá trị không hợp lệ', 'Số ngày lưu trữ phải là một số.');
      return;
    }
    updateMeMutation.mutate({ retention_days: parsed });
  }

  function toggleNotifications(enabled: boolean) {
    setNotificationsEnabled(enabled);
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

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Cài đặt</Text>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Hồ sơ</Text>
        <Text style={styles.value}>{user.display_name}</Text>
        <Text style={styles.valueMuted}>{user.email}</Text>
      </View>

      <View style={styles.section}>
        <TextField
          keyboardType="numeric"
          label="Lưu trữ (số ngày, để trống nếu không giới hạn)"
          onBlur={commitRetentionDays}
          onChangeText={setRetentionDaysInput}
          value={retentionDaysValue}
        />
      </View>

      <View style={[styles.section, styles.row]}>
        <Text style={styles.sectionLabel}>Thông báo</Text>
        <Switch onValueChange={toggleNotifications} value={notificationsEnabled} />
      </View>

      <PrimaryButton
        label="Đăng xuất"
        loading={logoutMutation.isPending}
        onPress={() => logoutMutation.mutate()}
      />

      <View style={styles.section}>
        <TextField
          label="Mật khẩu (để xóa tài khoản)"
          onChangeText={setDeletePassword}
          secureTextEntry
          value={deletePassword}
        />
        <PrimaryButton
          label="Xóa tài khoản"
          loading={deleteAccountMutation.isPending}
          onPress={handleDeleteAccount}
        />
      </View>

      <DevResetButton />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, gap: 20 },
  title: { ...typography.title, color: colors.text },
  section: { gap: 8 },
  sectionLabel: { ...typography.caption, color: colors.textMuted },
  value: { ...typography.body, color: colors.text },
  valueMuted: { ...typography.caption, color: colors.textMuted },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
