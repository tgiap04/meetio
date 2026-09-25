import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';

export interface TranscriptJumpControlsProps {
  onScrollToTop: () => void;
  onScrollToBottom: () => void;
  onJumpToLastRead: () => void;
}

/** The header's "Đầu / Cuối / Gần đây" jump row (US-23). Split out of
 *  `real-transcript-screen.tsx` to keep that file under the project's
 *  200-line guidance once it also owns the cross-page search logic. */
export function TranscriptJumpControls({
  onScrollToTop,
  onScrollToBottom,
  onJumpToLastRead,
}: TranscriptJumpControlsProps) {
  return (
    <View style={styles.row}>
      <Pressable accessibilityLabel="Về đầu" hitSlop={8} onPress={onScrollToTop} testID="transcript-jump-top">
        <Text style={styles.label}>Đầu</Text>
      </Pressable>
      <Pressable accessibilityLabel="Về cuối" hitSlop={8} onPress={onScrollToBottom} testID="transcript-jump-bottom">
        <Text style={styles.label}>Cuối</Text>
      </Pressable>
      <Pressable
        accessibilityLabel="Đến vị trí đọc gần nhất"
        hitSlop={8}
        onPress={onJumpToLastRead}
        testID="transcript-jump-last-read"
      >
        <Text style={styles.label}>Gần đây</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10 },
  label: { ...typography.caption, color: colors.primaryStrong },
});
