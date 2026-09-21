import { StyleSheet, View } from 'react-native';
import { colors } from '../../theme/colors';

/**
 * Fixed bar-height ratios (0–1 of the waveform's max height), mirrored around
 * the centreline as `design/screen-06-ghi-am-truc-tiep.png` draws it — no
 * `Math.random()`, so every render and every snapshot is identical. Fifty
 * bars, matching the crop's bar count.
 */
const BAR_HEIGHT_RATIOS: readonly number[] = [
  0.3, 0.45, 0.25, 0.6, 0.35, 0.7, 0.4, 0.55, 0.3, 0.65, 0.45, 0.8, 0.5, 0.35, 0.6, 0.9, 0.55, 0.7,
  0.4, 0.85, 0.6, 0.95, 0.5, 0.75, 0.65, 0.65, 0.75, 0.5, 0.95, 0.6, 0.85, 0.4, 0.7, 0.55, 0.9, 0.6,
  0.35, 0.55, 0.5, 0.8, 0.45, 0.65, 0.3, 0.55, 0.4, 0.7, 0.25, 0.6, 0.45, 0.3,
];

export interface WaveformProps {
  /** Total height of the tallest bar, in points. */
  height?: number;
  testID?: string;
}

/** Static decorative waveform on the live-recording screen. No audio is read. */
export function Waveform({ height = 56, testID }: WaveformProps) {
  return (
    <View style={styles.row} testID={testID}>
      {BAR_HEIGHT_RATIOS.map((ratio, index) => (
        <View
          key={index}
          testID={testID ? `${testID}-bar-${index}` : undefined}
          style={[styles.bar, { height: Math.max(4, height * ratio) }]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  bar: { width: 3, borderRadius: 2, backgroundColor: colors.primary },
});

export { BAR_HEIGHT_RATIOS };
