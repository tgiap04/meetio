import { StyleSheet, View } from 'react-native';
import { colors } from '../../theme/colors';

export interface TranscriptProgressTrackProps {
  /** `0..1` playback position along the track. */
  position: number;
}

const KNOB_SIZE = 14;

/**
 * Filled segment + grey remainder + knob, matching `screen-09-transcript.png`.
 *
 * The knob position is a plain prop, not driven by any playback clock — see
 * `AudioPlayerBar`'s doc comment for why the value passed in does not equal
 * `00:18 / 42:18`'s own ratio.
 */
export function TranscriptProgressTrack({ position }: TranscriptProgressTrackProps) {
  const clamped = Math.min(1, Math.max(0, position));

  return (
    <View style={styles.track} testID="transcript-progress-track">
      <View style={[styles.filled, { width: `${clamped * 100}%` }]} />
      <View style={[styles.knob, { left: `${clamped * 100}%` }]} testID="transcript-progress-knob" />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    justifyContent: 'center',
  },
  filled: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 2,
    backgroundColor: colors.primary,
  },
  knob: {
    position: 'absolute',
    width: KNOB_SIZE,
    height: KNOB_SIZE,
    borderRadius: KNOB_SIZE / 2,
    marginLeft: -KNOB_SIZE / 2,
    backgroundColor: colors.primary,
  },
});
