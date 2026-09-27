import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { colors } from '../../theme/colors';

export const BAR_COUNT = 50;
const QUIET = 0.08;

/** Engine level (-2 silence … 10 loud) → bar height ratio 0.08 … 1. */
export function levelToRatio(level: number): number {
  return Math.min(1, Math.max(QUIET, (level + 2) / 12));
}

export interface WaveformProps {
  /** Latest input level, or `null` when there is none to show (paused, or quality `standard`). */
  level: number | null;
  height?: number;
  testID?: string;
}

/**
 * The live input level as 50 bars scrolling right to left (quality `high` only — US-43 trades
 * the waveform for battery). With no level the bars lie flat rather than pretend to hear sound.
 */
export function Waveform({ level, height = 56, testID }: WaveformProps) {
  const [history, setHistory] = useState<number[]>(() => Array(BAR_COUNT).fill(QUIET));
  const last = useRef<number | null>(null);

  useEffect(() => {
    if (level === null) {
      setHistory(Array(BAR_COUNT).fill(QUIET));
    } else if (level !== last.current) {
      setHistory((h) => [...h.slice(1), levelToRatio(level)]);
    }
    last.current = level;
  }, [level]);

  return (
    <View style={styles.row} testID={testID}>
      {history.map((ratio, index) => (
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
  row: { flexDirection: 'row', alignItems: 'center', gap: 3, minHeight: 56 },
  bar: { width: 3, borderRadius: 2, backgroundColor: colors.primary },
});
