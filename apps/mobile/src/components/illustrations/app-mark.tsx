import { StyleSheet, View } from 'react-native';
import { BrandFill } from './brand-fill';
import { colors } from '../../theme/colors';

/**
 * The app icon on the splash screen (design screen 1): an orange rounded
 * square holding five white waveform bars of different heights.
 *
 * The fill is the measured diagonal gradient, not a flat colour — see
 * `BrandFill`. It originally shipped flat on the assumption the difference
 * would not read at icon size; on the real design it does.
 */
const BAR_HEIGHT_RATIOS = [0.32, 0.52, 0.82, 0.58, 0.38];

export interface AppMarkProps {
  size: number;
  testID?: string;
}

export function AppMark({ size, testID }: AppMarkProps) {
  const barWidth = Math.max(2, Math.round(size * 0.07));

  return (
    <BrandFill
      testID={testID}
      style={[
        styles.container,
        { width: size, height: size, borderRadius: size * 0.28 },
      ]}
    >
      {BAR_HEIGHT_RATIOS.map((ratio, index) => (
        <View
          key={index}
          testID={testID ? `${testID}-bar-${index}` : undefined}
          style={{
            width: barWidth,
            height: Math.round(size * ratio),
            borderRadius: barWidth / 2,
            backgroundColor: colors.primaryText,
            marginHorizontal: barWidth / 2,
          }}
        />
      ))}
    </BrandFill>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
