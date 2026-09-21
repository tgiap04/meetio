import { router } from 'expo-router';
import { useState } from 'react';
import { SafeAreaView, StyleSheet, View } from 'react-native';
import { RecordingControls } from '../../src/components/recording-live/recording-controls';
import { RecordingStatusBar } from '../../src/components/recording-live/recording-status-bar';
import { LiveTranscriptFeed, type LiveTranscriptLanguage } from '../../src/components/recording-live/live-transcript-feed';
import { Waveform } from '../../src/components/recording-live/waveform';
import { SegmentedTabs } from '../../src/components/ui/segmented-tabs';
import { RECORDING_DONE_ROUTE } from '../../src/navigation/app-routes';
import { colors } from '../../src/theme/colors';

/**
 * Screen 06 — the middle of the recording chain (05 Cài đặt ghi âm → **06** →
 * 07 Sau khi kết thúc). Presentation only: the waveform is a fixed array,
 * the elapsed time is the design's static `00:24:18`, and no `expo-audio` or
 * permission API is touched here (see phase-05's hard rule — importing
 * `expo-audio` crashes `jest-expo` at module load before any test body runs).
 *
 * PROTOTYPE-HONESTY NOTE: this screen displays "Đang ghi âm" (recording in
 * progress) while capturing no audio whatsoever. That is acceptable inside a
 * UI-only prototype but must never reach a real user as production behavior —
 * a recording indicator that does not reflect reality is a consent problem,
 * not a cosmetic one. Tracked in the phase-05 hand-back; must be resolved
 * before any real audio pipeline ships behind this screen.
 *
 * Pause is the screen's only forward edge (no "resume" state is drawn in the
 * design) — it advances to `RECORDING_DONE_ROUTE`. The X leaves the chain
 * entirely via `router.back()`. Camera and bookmark are deliberately inert;
 * the design draws no destination for either.
 */
const ELAPSED_TIME = '00:24:18';

const LANGUAGE_TABS = [
  { key: 'vi', label: 'Tiếng Việt' },
  { key: 'en', label: 'Tiếng Anh' },
] as const;

export default function RecordingLiveScreen() {
  const [language, setLanguage] = useState<LiveTranscriptLanguage>('vi');

  return (
    <SafeAreaView style={styles.screen}>
      <RecordingStatusBar elapsed={ELAPSED_TIME} onClose={() => router.back()} />

      <View style={styles.waveformWrap}>
        <Waveform />
      </View>

      <RecordingControls
        onPausePress={() => router.push(RECORDING_DONE_ROUTE)}
      />

      <View style={styles.tabsWrap}>
        <SegmentedTabs
          activeKey={language}
          items={[...LANGUAGE_TABS]}
          onChange={(key) => setLanguage(key as LiveTranscriptLanguage)}
        />
      </View>

      <LiveTranscriptFeed language={language} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface, paddingTop: 8, gap: 20 },
  waveformWrap: { paddingHorizontal: 16, alignItems: 'center' },
  tabsWrap: { paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
});
