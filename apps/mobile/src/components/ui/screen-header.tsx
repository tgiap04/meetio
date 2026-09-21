import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AppIcon } from '../icons/app-icon';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';

export interface ScreenHeaderProps {
  title: string;
  onBack: () => void;
  /** Optional trailing slot — e.g. the edit icon on screen-09 Transcript. */
  trailing?: ReactNode;
}

/** Back chevron + title header for every stacked screen (05/07/09/10/14). */
export function ScreenHeader({ title, onBack, trailing }: ScreenHeaderProps) {
  return (
    <View style={styles.container}>
      <Pressable accessibilityLabel="Quay lại" accessibilityRole="button" hitSlop={8} onPress={onBack}>
        <AppIcon color={colors.text} name="chevronLeft" size={26} />
      </Pressable>
      <Text numberOfLines={1} style={styles.title}>
        {title}
      </Text>
      <View style={styles.trailing}>{trailing}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  title: { ...typography.heading, color: colors.text, flex: 1 },
  trailing: { minWidth: 26, alignItems: 'flex-end' },
});
