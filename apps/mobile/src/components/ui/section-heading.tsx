import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';

export interface SectionHeadingProps {
  title: string;
  /** e.g. "Xem tất cả" on screen-04's "Cuộc họp gần đây" row. */
  trailingLabel?: string;
  onTrailingPress?: () => void;
}

/** Section title with an optional trailing link — "Cuộc họp gần đây / Xem tất cả". */
export function SectionHeading({ title, trailingLabel, onTrailingPress }: SectionHeadingProps) {
  return (
    <View style={styles.row}>
      <Text style={styles.title}>{title}</Text>
      {trailingLabel ? (
        <Pressable accessibilityRole="button" hitSlop={8} onPress={onTrailingPress}>
          <Text style={styles.trailing}>{trailingLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { ...typography.sectionTitle, color: colors.text },
  trailing: { ...typography.body, color: colors.primaryStrong },
});
