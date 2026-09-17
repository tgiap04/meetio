import { StyleSheet, View } from 'react-native';
import { colors } from '../theme/colors';

/**
 * Page indicator shared by the splash screen and onboarding (design.png,
 * screens 1 and 2 both draw three dots with an elongated pill as the active
 * one). Pure props in, `View`s out — no state, no gesture handling.
 */
export interface PagerDotsProps {
  count: number;
  activeIndex: number;
  testID?: string;
}

const DOT_SIZE = 8;
const ACTIVE_DOT_WIDTH = 24;

export function PagerDots({ count, activeIndex, testID }: PagerDotsProps) {
  return (
    <View testID={testID} style={styles.row}>
      {Array.from({ length: count }, (_, index) => {
        const isActive = index === activeIndex;
        return (
          <View
            key={index}
            testID={testID ? `${testID}-dot-${index}` : undefined}
            style={[
              styles.dot,
              {
                width: isActive ? ACTIVE_DOT_WIDTH : DOT_SIZE,
                backgroundColor: isActive ? colors.primary : colors.border,
              },
            ]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { height: DOT_SIZE, borderRadius: DOT_SIZE / 2 },
});
