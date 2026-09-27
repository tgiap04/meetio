import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AppIcon } from '../icons/app-icon';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';

export interface RecordingStatusBarProps {
  /** `HH:MM:SS` of recorded time, pauses excluded. */
  elapsed: string;
  paused: boolean;
  /** Leaves the screen; recording carries on and Home offers the way back. */
  onClose: () => void;
}

/**
 * Top of screen 06: the recording indicator and elapsed time. The indicator tells the truth —
 * red "Đang ghi âm" only while the microphone is on, grey "Đã tạm dừng" otherwise (US-09).
 */
export function RecordingStatusBar({ elapsed, paused, onClose }: RecordingStatusBarProps) {
  return (
    <View style={styles.row}>
      <View style={styles.left}>
        <View style={[styles.dot, paused && styles.dotPaused]} testID="recording-status-dot" />
        <View>
          <Text style={styles.label}>{paused ? 'Đã tạm dừng' : 'Đang ghi âm'}</Text>
          <Text style={styles.elapsed} testID="recording-elapsed">
            {elapsed}
          </Text>
        </View>
      </View>
      <Pressable
        accessibilityLabel="Thu nhỏ, vẫn tiếp tục ghi"
        accessibilityRole="button"
        hitSlop={8}
        onPress={onClose}
        testID="recording-close-button"
      >
        <AppIcon color={colors.textMuted} name="close" size={22} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingHorizontal: 16 },
  left: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.danger, marginTop: 6 },
  dotPaused: { backgroundColor: colors.textMuted },
  label: { ...typography.label, color: colors.text },
  elapsed: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
});
