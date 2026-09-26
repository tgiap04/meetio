import { router } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';
import { ScreenSurface } from '../../src/components/ui/screen-surface';
import { useRecordConsentMutation } from '../../src/hooks/use-account-mutations';
import { getErrorMessage } from '../../src/api/error-messages';
import { PrimaryButton } from '../../src/components/primary-button';
import { PRIVACY_POLICY_ROUTE } from '../../src/navigation/app-routes';
import { colors } from '../../src/theme/colors';
import { typography } from '../../src/theme/typography';

/**
 * Recording-consent gate (US-04, NFR-01 consent v2). A legal requirement, not
 * onboarding flavor text — it blocks the Start-recording action on Home until
 * accepted, and is shown again whenever `PublicUser.consent_required` is true
 * (first use, or the consent text version changed since the user last
 * accepted — see `(tabs)/index.tsx`'s `needsConsent`).
 *
 * The copy below was corrected from an earlier version that wrongly said
 * Meetio stores the audio recording — it does not (see docs/privacy-policy.md
 * §2). Keep this summary short; the accurate detail lives in the full policy,
 * one tap away via "Đọc chính sách đầy đủ".
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
        Khi bạn ghi âm một cuộc họp, giọng nói được nhận diện ngay trên điện thoại của bạn — âm
        thanh không rời khỏi máy. Bản chép lời (văn bản) được gửi về máy chủ Meetio và Google Gemini
        để tạo tóm tắt, rút thực thể, phục vụ tìm kiếm và trả lời câu hỏi của bạn. Dữ liệu được giữ
        theo hạn lưu trữ bạn chọn trong Cài đặt và có thể xóa bất cứ lúc nào.
      </Text>

      <Pressable accessibilityRole="link" onPress={() => router.push(PRIVACY_POLICY_ROUTE)}>
        <Text style={styles.link}>Đọc chính sách đầy đủ</Text>
      </Pressable>

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
  link: { ...typography.body, color: colors.primaryStrong, textDecorationLine: 'underline' },
  error: { ...typography.caption, color: colors.danger },
});
