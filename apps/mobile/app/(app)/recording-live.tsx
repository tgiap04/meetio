import { Redirect, router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { ScreenSurface } from '../../src/components/ui/screen-surface';
import { RecordingControls } from '../../src/components/recording-live/recording-controls';
import { RecordingStatusBar } from '../../src/components/recording-live/recording-status-bar';
import { LiveTranscriptList } from '../../src/components/recording-live/live-transcript-list';
import { SyncIndicator } from '../../src/components/recording-live/sync-indicator';
import { EndingPanel } from '../../src/components/recording-live/ending-panel';
import { Waveform } from '../../src/components/recording-live/waveform';
import { useRecordingStore } from '../../src/recording/recording.store';
import { useElapsedClock } from '../../src/hooks/use-elapsed-clock';
import { useRecordingActions } from '../../src/hooks/use-recording-actions';
import { RECORDING_DONE_ROUTE } from '../../src/navigation/app-routes';
import { APP_HOME_ROUTE } from '../../src/navigation/route-guards';
import { colors } from '../../src/theme/colors';
import { typography } from '../../src/theme/typography';

/**
 * Screen 06 — the live recording. Everything here reflects the real session: the indicator,
 * the clock (pauses excluded), the input level, the transcript as it is recognised, and whether
 * it has reached the server. The X only minimises — recording continues and Home links back.
 * "Kết thúc" waits for every segment to sync (US-16), then moves on to screen 07.
 */
export default function RecordingLiveScreen() {
  const phase = useRecordingStore((s) => s.phase);
  const lines = useRecordingStore((s) => s.lines);
  const partial = useRecordingStore((s) => s.partial);
  const volume = useRecordingStore((s) => s.volume);
  const quality = useRecordingStore((s) => s.quality);
  const sync = useRecordingStore((s) => s.sync);
  const problem = useRecordingStore((s) => s.problem);
  const endedMeetingId = useRecordingStore((s) => s.endedMeetingId);
  const elapsed = useElapsedClock();
  const { run, busy, error } = useRecordingActions();
  // Once we have moved on to screen 07, the store is idle — that must not ALSO redirect Home.
  const movedOn = useRef(false);

  useEffect(() => {
    if (!endedMeetingId) return;
    movedOn.current = true;
    useRecordingStore.setState({ endedMeetingId: null });
    router.replace({ pathname: RECORDING_DONE_ROUTE, params: { id: endedMeetingId } });
  }, [endedMeetingId]);

  if (phase === 'idle') return movedOn.current || endedMeetingId ? null : <Redirect href={APP_HOME_ROUTE} />;

  const leave = () => (router.canGoBack() ? router.back() : router.replace(APP_HOME_ROUTE));

  function confirmEnd() {
    Alert.alert('Kết thúc cuộc họp?', 'Meetio sẽ đồng bộ nốt transcript rồi bắt đầu tóm tắt.', [
      { text: 'Ghi tiếp', style: 'cancel' },
      { text: 'Kết thúc', style: 'destructive', onPress: () => void run((s) => s.end()) },
    ]);
  }

  const paused = phase === 'paused';
  return (
    <ScreenSurface style={styles.screen}>
      <RecordingStatusBar elapsed={elapsed} onClose={leave} paused={paused || phase === 'ending'} />
      <SyncIndicator online={sync.online} pending={sync.pending} />
      {problem || error ? (
        <View style={styles.problem} testID="recording-problem">
          <Text style={styles.problemText}>{problem ?? error}</Text>
        </View>
      ) : null}

      {phase === 'ending' ? (
        <EndingPanel onLeave={leave} online={sync.online} pending={sync.pending} />
      ) : (
        <>
          <View style={styles.waveformWrap}>
            <Waveform level={quality === 'high' && !paused ? volume : null} testID="recording-waveform" />
          </View>
          <RecordingControls
            busy={busy}
            onEnd={confirmEnd}
            onPauseToggle={() => void run((s) => (paused ? s.resume() : s.pause()))}
            paused={paused}
          />
        </>
      )}

      <View style={styles.divider} />
      <LiveTranscriptList lines={lines} partial={partial} />
    </ScreenSurface>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface, paddingTop: 8, gap: 16 },
  waveformWrap: { paddingHorizontal: 16, alignItems: 'center' },
  divider: { height: 1, backgroundColor: colors.border },
  problem: { marginHorizontal: 16, padding: 12, borderRadius: 12, backgroundColor: colors.warningTint },
  problemText: { ...typography.caption, color: colors.warning },
});
