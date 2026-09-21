import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AppIcon } from '../icons/app-icon';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';

export interface RecordingStatusBarProps {
  /** Verbatim design value, `HH:MM:SS` — static, see module doc on `recording-live.tsx`. */
  elapsed: string;
  onClose: () => void;
}

/**
 * Top of screen-06: a red dot, "Đang ghi âm", the elapsed time beneath it,
 * and a close (X) button that leaves the recording chain entirely.
 *
 * NOTE ON THE COPY: this label reads "Đang ghi âm" (recording in progress)
 * while no audio is ever captured — see the prototype-honesty note in
 * `recording-live.tsx` and the phase hand-back. Acceptable for a UI-only
 * prototype; must not ship to a real user without an actual recording
 * pipeline behind it.
 */
export function RecordingStatusBar({ elapsed, onClose }: RecordingStatusBarProps) {
  return (
    <View style={styles.row}>
      <View style={styles.left}>
        <View style={styles.dot} testID="recording-status-dot" />
        <View>
          <Text style={styles.label}>Đang ghi âm</Text>
          <Text style={styles.elapsed}>{elapsed}</Text>
        </View>
      </View>
      <Pressable
        accessibilityLabel="Đóng"
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
  label: { ...typography.label, color: colors.text },
  elapsed: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
});
