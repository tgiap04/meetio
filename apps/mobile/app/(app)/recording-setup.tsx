import { useState } from 'react';
import { Redirect, router } from 'expo-router';
import { ActivityIndicator, Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ScreenSurface } from '../../src/components/ui/screen-surface';
import { ScreenHeader } from '../../src/components/ui/screen-header';
import { SectionHeading } from '../../src/components/ui/section-heading';
import { AudioSourceCard } from '../../src/components/recording-setup/audio-source-card';
import { RecognitionCheckFailed } from '../../src/components/recording-setup/recognition-check-failed';
import { ServerModeNotice } from '../../src/components/recording-setup/server-mode-notice';
import { TranslationSection } from '../../src/components/recording-setup/translation-section';
import { PrimaryButton } from '../../src/components/primary-button';
import { SecondaryButton } from '../../src/components/ui/secondary-button';
import { AUDIO_SOURCE_OPTIONS, BLUETOOTH_HINT, QUALITY_OPTIONS } from '../../src/content/recording-options';
import { useRecordingSetup } from '../../src/hooks/use-recording-setup';
import { useRecordingActions } from '../../src/hooks/use-recording-actions';
import { useMeQuery } from '../../src/hooks/use-me-query';
import { isServerReachable } from '../../src/api/stt';
import { requestRecordingPermissions } from '../../src/recording/expo-stt-engine';
import { requestServerRecordingPermissions } from '../../src/recording/server-stt-native';
import { useRecordingStore } from '../../src/recording/recording.store';
import { RECORDING_LIVE_ROUTE } from '../../src/navigation/app-routes';
import { colors } from '../../src/theme/colors';
import { typography } from '../../src/theme/typography';

type PermissionProblem = null | 'denied' | 'blocked';

const SERVER_OFFLINE_MESSAGE = 'Chế độ máy chủ cần kết nối mạng. Kiểm tra mạng rồi thử lại.';

/**
 * Screen 05 — choose language, audio source and quality, then Start (US-07, US-12, US-42, US-43).
 * Start asks for microphone + speech-recognition permission, creates the meeting ON THE DEVICE
 * (the server copy follows, so this works offline too) and opens the mic. A phone that cannot
 * recognise speech offline (Phase 18) sends audio chunks to the server instead: the screen says so,
 * only asks for the microphone, and refuses to start without a network. "Dịch sang" (Phase 09)
 * is off unless chosen, and says it costs more when it is on.
 */
export default function RecordingSetupScreen() {
  const phase = useRecordingStore((s) => s.phase);
  const me = useMeQuery();
  const { loading, mode, checkFailed, retryCheck, languages, preferences, update } = useRecordingSetup();
  const { run, busy, error } = useRecordingActions();
  const [permission, setPermission] = useState<PermissionProblem>(null);
  const [offline, setOffline] = useState(false);
  const [checking, setChecking] = useState(false);

  if (phase !== 'idle') return <Redirect href={RECORDING_LIVE_ROUTE} />;

  async function handleStart() {
    const ownerId = me.data?.user.id;
    const language = preferences.language;
    if (!ownerId || !language || !mode) return;
    setOffline(false);
    if (mode === 'server') {
      setChecking(true);
      const reachable = await isServerReachable().finally(() => setChecking(false));
      if (!reachable) {
        setOffline(true);
        return;
      }
    }
    const requestPermissions = mode === 'server' ? requestServerRecordingPermissions : requestRecordingPermissions;
    const result = await requestPermissions().catch(() => ({ granted: false, canAskAgain: true }));
    if (!result.granted) {
      setPermission(result.canAskAgain ? 'denied' : 'blocked');
      return;
    }
    setPermission(null);
    const id = await run((session) => session.start({ ownerId, language, audioSource: preferences.audioSource, quality: preferences.quality, mode, translateTo: preferences.translateTo }));
    if (id) router.replace(RECORDING_LIVE_ROUTE);
  }

  return (
    <ScreenSurface>
      <ScreenHeader onBack={() => router.back()} title="Cài đặt ghi âm" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.section}>
          <SectionHeading title="Nguồn âm thanh" />
          <AudioSourceCard onSelect={(audioSource) => update({ audioSource })} options={AUDIO_SOURCE_OPTIONS} selectedId={preferences.audioSource} />
          {preferences.audioSource === 'external_bluetooth' ? <Text style={styles.hint}>{BLUETOOTH_HINT}</Text> : null}
        </View>

        <View style={styles.section}>
          <SectionHeading title="Ngôn ngữ" />
          {loading ? (
            <ActivityIndicator color={colors.primary} />
          ) : checkFailed ? (
            <RecognitionCheckFailed onRetry={retryCheck} />
          ) : (
            <AudioSourceCard
              onSelect={(language) => update({ language })}
              options={languages.map((l) => ({ id: l.tag, label: l.label }))}
              selectedId={preferences.language}
            />
          )}
          {mode === 'server' ? <ServerModeNotice /> : null}
        </View>

        <View style={styles.section}>
          <TranslationSection language={preferences.language} onChange={(translateTo) => update({ translateTo })} translateTo={preferences.translateTo} />
        </View>

        <View style={styles.section}>
          <SectionHeading title="Chế độ ghi âm" />
          <AudioSourceCard onSelect={(quality) => update({ quality })} options={QUALITY_OPTIONS} selectedId={preferences.quality} />
        </View>

        {permission ? (
          <View style={styles.problem} testID="permission-problem">
            <Text style={styles.problemText}>
              Meetio cần quyền micro và nhận diện giọng nói để ghi cuộc họp.
              {permission === 'blocked' ? ' Quyền đã bị tắt — bật lại trong Cài đặt của máy.' : ' Bấm Bắt đầu để cấp quyền.'}
            </Text>
            {permission === 'blocked' ? <SecondaryButton label="Mở Cài đặt" onPress={() => void Linking.openSettings()} /> : null}
          </View>
        ) : null}
        {offline ? <Text style={styles.problemText}>{SERVER_OFFLINE_MESSAGE}</Text> : null}
        {error ? <Text style={styles.problemText}>{error}</Text> : null}
      </ScrollView>
      <View style={styles.footer}>
        <PrimaryButton
          disabled={loading || !mode || !preferences.language || !me.data}
          label="Bắt đầu"
          loading={busy || checking}
          onPress={() => void handleStart()}
        />
      </View>
    </ScreenSurface>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 24 },
  section: { gap: 12 },
  hint: { ...typography.caption, color: colors.textMuted },
  problem: { gap: 12, padding: 12, borderRadius: 12, backgroundColor: colors.warningTint },
  problemText: { ...typography.caption, color: colors.warning },
  footer: { paddingHorizontal: 16, paddingBottom: 24, paddingTop: 8 },
});
