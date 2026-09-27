import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { RecordingPhase } from '../../recording/recording.store';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';

export interface ActiveRecordingBannerProps {
  phase: Exclude<RecordingPhase, 'idle'>;
  elapsed: string;
  onPress: () => void;
}

/** The recording the user minimised with X — still running; one tap back to screen 06. */
export function ActiveRecordingBanner({ phase, elapsed, onPress }: ActiveRecordingBannerProps) {
  const label = phase === 'recording' ? 'Đang ghi cuộc họp' : phase === 'paused' ? 'Cuộc họp đang tạm dừng' : 'Đang hoàn tất cuộc họp';
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.banner} testID="active-recording-banner">
      <View style={[styles.dot, phase !== 'recording' && styles.dotIdle]} />
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.elapsed}>{elapsed}</Text>
      <Text style={styles.open}>Mở lại</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 16, backgroundColor: colors.primaryTint },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.danger },
  dotIdle: { backgroundColor: colors.textMuted },
  label: { ...typography.label, color: colors.text, flex: 1 },
  elapsed: { ...typography.caption, color: colors.textMuted },
  open: { ...typography.label, color: colors.primaryStrong },
});
