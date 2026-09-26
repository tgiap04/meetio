import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { ScreenSurface } from '../../src/components/ui/screen-surface';
import { ScreenHeader } from '../../src/components/ui/screen-header';
import { PrivacyPolicyContent } from '../../src/components/privacy-policy/privacy-policy-content';
import { PRIVACY_POLICY_CONTENT, PRIVACY_POLICY_META } from '../../src/content/privacy-policy';
import { colors } from '../../src/theme/colors';
import { typography } from '../../src/theme/typography';

/**
 * Full privacy-policy screen (NFR-01), reached from the consent screen's
 * "Đọc chính sách đầy đủ" link and from Settings' "Chính sách bảo mật" row.
 * The body text is `PRIVACY_POLICY_CONTENT` — kept faithful to
 * `docs/privacy-policy.md` by `privacy-policy.test.ts`, not authored here.
 */
export default function PrivacyPolicyScreen() {
  return (
    <ScreenSurface>
      <ScreenHeader onBack={() => router.back()} title="Chính sách quyền riêng tư" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.caption}>
          Phiên bản đồng ý: {PRIVACY_POLICY_META.consentVersion} · {PRIVACY_POLICY_META.updatedLabel}
        </Text>
        <PrivacyPolicyContent blocks={PRIVACY_POLICY_CONTENT} />
      </ScrollView>
    </ScreenSurface>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, gap: 12, paddingBottom: 40 },
  caption: { ...typography.caption, color: colors.textMuted },
});
