import { useState } from 'react';
import { router } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { ScreenSurface } from '../../src/components/ui/screen-surface';
import { ScreenHeader } from '../../src/components/ui/screen-header';
import { SectionHeading } from '../../src/components/ui/section-heading';
import { AudioSourceCard } from '../../src/components/recording-setup/audio-source-card';
import { SettingsSelectRow } from '../../src/components/recording-setup/settings-select-row';
import { TranslationToggleSection } from '../../src/components/recording-setup/translation-toggle-section';
import { PrimaryButton } from '../../src/components/primary-button';
import {
  AUDIO_SOURCE_OPTIONS,
  RECORDING_SETTINGS_DEFAULTS,
} from '../../src/mocks/recording-options.mock';
import { RECORDING_LIVE_ROUTE } from '../../src/navigation/app-routes';

/**
 * Screen 05 of the design — the pre-flight sheet reached from Home's primary
 * action and from Settings' "Cài đặt ghi âm" row. Every value below is local
 * `useState`, reset on unmount by design: this is a UI-only phase, and
 * persisting a recording preference would mean touching
 * `device-preferences.ts`, outside this phase's ownership (phase-04 Key
 * Insight #1). Nothing here calls a microphone or permission API — that
 * stays owned by `permission.tsx` and the boot resolver.
 */
export default function RecordingSetupScreen() {
  const [sourceId, setSourceId] = useState(AUDIO_SOURCE_OPTIONS[0].id);
  const [translationEnabled, setTranslationEnabled] = useState(
    RECORDING_SETTINGS_DEFAULTS.translationEnabled,
  );

  return (
    <ScreenSurface>
      <ScreenHeader onBack={() => router.back()} title="Cài đặt ghi âm" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.section}>
          <SectionHeading title="Nguồn âm thanh" />
          <AudioSourceCard
            onSelect={setSourceId}
            options={AUDIO_SOURCE_OPTIONS}
            selectedId={sourceId}
          />
        </View>

        <View style={styles.section}>
          <SectionHeading title="Ngôn ngữ" />
          <SettingsSelectRow value={RECORDING_SETTINGS_DEFAULTS.language} />
        </View>

        <TranslationToggleSection
          enabled={translationEnabled}
          onToggle={setTranslationEnabled}
          targetLabel={RECORDING_SETTINGS_DEFAULTS.translationTarget}
        />

        <View style={styles.section}>
          <SectionHeading title="Chế độ ghi âm" />
          <SettingsSelectRow value={RECORDING_SETTINGS_DEFAULTS.qualityMode} />
        </View>
      </ScrollView>
      <View style={styles.footer}>
        <PrimaryButton label="Bắt đầu" onPress={() => router.push(RECORDING_LIVE_ROUTE)} />
      </View>
    </ScreenSurface>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 24 },
  section: { gap: 12 },
  footer: { paddingHorizontal: 16, paddingBottom: 24, paddingTop: 8 },
});
