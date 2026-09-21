import { router } from 'expo-router';
import { StyleSheet, Text} from 'react-native';
import { ScreenSurface } from '../../src/components/ui/screen-surface';
import { useRecordConsentMutation } from '../../src/hooks/use-account-mutations';
import { getErrorMessage } from '../../src/api/error-messages';
import { PrimaryButton } from '../../src/components/primary-button';
import { colors } from '../../src/theme/colors';
import { typography } from '../../src/theme/typography';

/**
 * Recording-consent gate (US-04). This is a legal requirement, not onboarding
 * flavor text: it must explain what recorded audio becomes (transcript,
 * AI-derived summaries, a knowledge graph — all attributable to this account)
 * before the user can unblock the Start button on the home screen.
 */
export default function ConsentScreen() {
  const consentMutation = useRecordConsentMutation();
  const errorMessage = consentMutation.isError ? getErrorMessage(consentMutation.error) : null;

  async function handleConfirm() {
    await consentMutation.mutateAsync();
    router.back();
  }

  return (
    <ScreenSurface style={styles.container}>
      <Text style={styles.title}>Đồng ý ghi âm</Text>
      <Text style={styles.body}>
        Khi bạn ghi âm một cuộc họp, Meetio lưu bản ghi âm, tạo bản chép lời, tóm tắt bằng AI và đồ
        thị tri thức liên quan đến cuộc họp đó, gắn với tài khoản của bạn. Dữ liệu được lưu theo
        chính sách lưu trữ trong phần Cài đặt và có thể xóa theo yêu cầu.
      </Text>

      {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}

      <PrimaryButton
        label="Tôi đồng ý"
        loading={consentMutation.isPending}
        onPress={handleConfirm}
      />
    </ScreenSurface>
  );
}

const styles = StyleSheet.create({
  container: { justifyContent: 'center', padding: 24, gap: 16 },
  title: { ...typography.title, color: colors.text },
  body: { ...typography.body, color: colors.text },
  error: { ...typography.caption, color: colors.danger },
});
