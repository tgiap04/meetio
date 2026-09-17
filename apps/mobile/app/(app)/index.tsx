import { Alert, StyleSheet, Text, View } from 'react-native';
import { Link, router } from 'expo-router';
import { useMeQuery } from '../../src/hooks/use-me-query';
import { getErrorMessage } from '../../src/api/error-messages';
import { LoadingState } from '../../src/components/loading-state';
import { ErrorState } from '../../src/components/error-state';
import { PrimaryButton } from '../../src/components/primary-button';
import { colors } from '../../src/theme/colors';
import { typography } from '../../src/theme/typography';

/**
 * Home screen. The "Start" button is the legal gate from US-04: it stays
 * disabled until `recording_consent_at` is set on the profile, and tapping it
 * while disabled sends the user straight to the consent screen rather than
 * silently doing nothing.
 *
 * Actually starting a recording session is Phase 07's scope (audio capture,
 * seq counters, local queueing) — not built here. Once consent is granted,
 * tapping Start surfaces that explicitly rather than pretending to record.
 */
export default function HomeScreen() {
  const meQuery = useMeQuery();

  if (meQuery.isPending) {
    return <LoadingState />;
  }

  if (meQuery.isError) {
    return <ErrorState message={getErrorMessage(meQuery.error)} onRetry={() => meQuery.refetch()} />;
  }

  const hasConsent = Boolean(meQuery.data.user.recording_consent_at);

  function handleStartPress() {
    if (!hasConsent) {
      router.push('/(app)/consent');
      return;
    }
    Alert.alert('Ghi âm', 'Tính năng ghi âm sẽ khả dụng ở Phase 07.');
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Xin chào, {meQuery.data.user.display_name}</Text>

      <PrimaryButton label="Bắt đầu" onPress={handleStartPress} />

      {!hasConsent ? (
        <Text style={styles.hint}>Cần xác nhận đồng ý ghi âm trước khi bắt đầu.</Text>
      ) : null}

      <Link href="/(app)/settings" style={styles.link}>
        Cài đặt
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, gap: 16 },
  title: { ...typography.title, color: colors.text },
  hint: { ...typography.caption, color: colors.textMuted, textAlign: 'center' },
  link: { ...typography.body, color: colors.primary, textAlign: 'center' },
});
