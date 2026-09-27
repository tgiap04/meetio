import { useState } from 'react';
import { Redirect, router } from 'expo-router';
import { ActivityIndicator, Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ScreenSurface } from '../../src/components/ui/screen-surface';
import { ScreenHeader } from '../../src/components/ui/screen-header';
import { SectionHeading } from '../../src/components/ui/section-heading';
import { AudioSourceCard } from '../../src/components/recording-setup/audio-source-card';
import { NoLanguageCard } from '../../src/components/recording-setup/no-language-card';
import { PrimaryButton } from '../../src/components/primary-button';
import { SecondaryButton } from '../../src/components/ui/secondary-button';
import { AUDIO_SOURCE_OPTIONS, BLUETOOTH_HINT, QUALITY_OPTIONS } from '../../src/content/recording-options';
import { useRecordingSetup } from '../../src/hooks/use-recording-setup';
import { useRecordingActions } from '../../src/hooks/use-recording-actions';
import { useMeQuery } from '../../src/hooks/use-me-query';
import { requestRecordingPermissions } from '../../src/recording/expo-stt-engine';
import { useRecordingStore } from '../../src/recording/recording.store';
import { RECORDING_LIVE_ROUTE } from '../../src/navigation/app-routes';
import { colors } from '../../src/theme/colors';
import { typography } from '../../src/theme/typography';

type PermissionProblem = null | 'denied' | 'blocked';

/**
 * Screen 05 — choose language, audio source and quality, then Start (US-07, US-12, US-42, US-43).
 * Start asks for microphone + speech-recognition permission, creates the meeting ON THE DEVICE
 * (the server copy follows, so this works offline too) and opens the mic. Translation (design's
 * middle block) returns with Phase 09 — offering it before it exists would be a false promise.
 */
export default function RecordingSetupScreen() {
  const phase = useRecordingStore((s) => s.phase);
  const me = useMeQuery();
  const { loading, languages, preferences, update } = useRecordingSetup();
  const { run, busy, error } = useRecordingActions();
  const [permission, setPermission] = useState<PermissionProblem>(null);

  if (phase !== 'idle') return <Redirect href={RECORDING_LIVE_ROUTE} />;

  async function handleStart() {
    const ownerId = me.data?.user.id;
    const language = preferences.language;
    if (!ownerId || !language) return;
    const result = await requestRecordingPermissions().catch(() => ({ granted: false, canAskAgain: true }));
    if (!result.granted) {
      setPermission(result.canAskAgain ? 'denied' : 'blocked');
      return;
    }
    setPermission(null);
    const id = await run((session) => session.start({ ownerId, language, audioSource: preferences.audioSource, quality: preferences.quality }));
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
          ) : languages.length === 0 ? (
            <NoLanguageCard />
          ) : (
            <AudioSourceCard
              onSelect={(language) => update({ language })}
              options={languages.map((l) => ({ id: l.tag, label: l.label }))}
              selectedId={preferences.language}
            />
          )}
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
        {error ? <Text style={styles.problemText}>{error}</Text> : null}
      </ScrollView>
      <View style={styles.footer}>
        <PrimaryButton
          disabled={loading || !preferences.language || !me.data}
          label="Bắt đầu"
          loading={busy}
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
