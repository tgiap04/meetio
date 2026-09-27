import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AppIcon } from '../icons/app-icon';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';

export interface RecordingControlsProps {
  paused: boolean;
  /** Disabled while a pause/resume/end is being written. */
  busy?: boolean;
  onPauseToggle: () => void;
  onEnd: () => void;
}

/**
 * Under the waveform: the large orange pause/resume button with its peach halo (design screen 06)
 * and "Kết thúc" beside it. Pausing turns the microphone off entirely (US-09). The design's camera
 * and bookmark circles had no destination and are gone now that the screen records for real.
 */
export function RecordingControls({ paused, busy = false, onPauseToggle, onEnd }: RecordingControlsProps) {
  return (
    <View style={styles.row}>
      <View style={styles.side} />

      <View style={styles.centreWrap}>
        <View style={styles.halo} />
        <Pressable
          accessibilityLabel={paused ? 'Tiếp tục ghi âm' : 'Tạm dừng ghi âm'}
          accessibilityRole="button"
          accessibilityState={{ disabled: busy }}
          disabled={busy}
          onPress={onPauseToggle}
          style={styles.pauseButton}
          testID="recording-pause-button"
        >
          <AppIcon color={colors.primaryText} name={paused ? 'mic' : 'pause'} size={28} />
        </Pressable>
      </View>

      <Pressable
        accessibilityLabel="Kết thúc cuộc họp"
        accessibilityRole="button"
        accessibilityState={{ disabled: busy }}
        disabled={busy}
        onPress={onEnd}
        style={styles.side}
        testID="recording-end-button"
      >
        <View style={styles.endButton}>
          <AppIcon color={colors.danger} name="stop" size={20} />
        </View>
        <Text style={styles.endLabel}>Kết thúc</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 32 },
  side: { width: 64, alignItems: 'center', gap: 4 },
  endButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  endLabel: { ...typography.caption, color: colors.textMuted },
  centreWrap: { alignItems: 'center', justifyContent: 'center' },
  halo: { position: 'absolute', width: 96, height: 96, borderRadius: 48, backgroundColor: colors.primaryTint },
  pauseButton: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
