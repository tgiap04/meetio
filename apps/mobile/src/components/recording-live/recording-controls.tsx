import { Pressable, StyleSheet, View } from 'react-native';
import { AppIcon } from '../icons/app-icon';
import { colors } from '../../theme/colors';

export interface RecordingControlsProps {
  /** Left circle — camera. No destination is drawn in the design; deliberately inert. */
  onCameraPress?: () => void;
  /** Centre pause — the screen's only forward edge, to the post-recording screen. */
  onPausePress: () => void;
  /** Right circle — bookmark. No destination is drawn in the design; deliberately inert. */
  onBookmarkPress?: () => void;
}

/**
 * The three controls under the waveform: a plain camera circle, the large
 * orange pause button with a peach halo ring behind it, and a plain bookmark
 * circle. Camera and bookmark have no forward edge in the design — see the
 * phase hand-back, they are intentionally inert here.
 */
export function RecordingControls({ onCameraPress, onPausePress, onBookmarkPress }: RecordingControlsProps) {
  return (
    <View style={styles.row}>
      <Pressable
        accessibilityLabel="Camera"
        accessibilityRole="button"
        onPress={onCameraPress}
        style={styles.sideButton}
        testID="recording-camera-button"
      >
        <AppIcon color={colors.text} name="camera" size={20} />
      </Pressable>

      <View style={styles.centreWrap}>
        <View style={styles.halo} />
        <Pressable
          accessibilityLabel="Tạm dừng ghi âm"
          accessibilityRole="button"
          onPress={onPausePress}
          style={styles.pauseButton}
          testID="recording-pause-button"
        >
          <AppIcon color={colors.primaryText} name="pause" size={28} />
        </Pressable>
      </View>

      <Pressable
        accessibilityLabel="Đánh dấu"
        accessibilityRole="button"
        onPress={onBookmarkPress}
        style={styles.sideButton}
        testID="recording-bookmark-button"
      >
        <AppIcon color={colors.text} name="bookmark" size={20} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 32 },
  sideButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centreWrap: { alignItems: 'center', justifyContent: 'center' },
  halo: {
    position: 'absolute',
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.primaryTint,
  },
  pauseButton: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
