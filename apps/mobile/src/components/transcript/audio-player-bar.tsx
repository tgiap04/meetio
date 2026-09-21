import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { TranscriptProgressTrack } from './transcript-progress-track';
import { AppIcon } from '../icons/app-icon';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';

/**
 * The crop draws the knob roughly 8% along the track while the label beside
 * it reads `00:18 / 42:18` — a ratio of ~0.7%. Those two disagree in the
 * source design. Per the phase's Key Insight #4, the drawn knob position is
 * what this component matches, not the number the label states.
 */
const DESIGN_KNOB_POSITION = 0.08;
const ELAPSED_LABEL = '00:18';
const TOTAL_LABEL = '42:18';

/**
 * Bottom playback control surface for the transcript screen. Purely
 * presentational: no `expo-audio` import, no timer, no real playback. The
 * play button only flips its own icon between play/pause so a tap reads as
 * acknowledged — it does not simulate audio progressing.
 */
export function AudioPlayerBar() {
  const [isPlayingIconShown, setIsPlayingIconShown] = useState(false);

  return (
    <View style={styles.container}>
      <View style={styles.progressRow}>
        <TranscriptProgressTrack position={DESIGN_KNOB_POSITION} />
        <Text style={styles.timeLabel} testID="audio-player-time-label">
          {ELAPSED_LABEL} / {TOTAL_LABEL}
        </Text>
      </View>
      <View style={styles.controlsRow}>
        <Pressable
          accessibilityLabel="Tua lại 10 giây"
          accessibilityRole="button"
          hitSlop={8}
          style={styles.skipButton}
          testID="audio-player-skip-back"
        >
          <AppIcon color={colors.text} name="skipBack" size={22} />
        </Pressable>
        <Pressable
          accessibilityLabel={isPlayingIconShown ? 'Tạm dừng' : 'Phát'}
          accessibilityRole="button"
          onPress={() => setIsPlayingIconShown((shown) => !shown)}
          style={styles.playButton}
          testID="audio-player-play"
        >
          <AppIcon color={colors.primaryText} name={isPlayingIconShown ? 'pause' : 'play'} size={28} />
        </Pressable>
        <Pressable
          accessibilityLabel="Tua tới 10 giây"
          accessibilityRole="button"
          hitSlop={8}
          style={styles.skipButton}
          testID="audio-player-skip-forward"
        >
          <AppIcon color={colors.text} name="skipForward" size={22} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 20,
    gap: 18,
  },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  timeLabel: { ...typography.caption, color: colors.textMuted },
  controlsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 28 },
  skipButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
