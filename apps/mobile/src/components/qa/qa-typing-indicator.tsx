import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';

/** Shown in place of the assistant bubble while a question is in flight. */
export function QaTypingIndicator() {
  return (
    <View style={styles.container} testID="qa-typing-indicator">
      <Text style={styles.text}>Đang trả lời…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignSelf: 'flex-start',
    backgroundColor: colors.background,
    borderRadius: 16,
    borderBottomLeftRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  text: { ...typography.caption, color: colors.textMuted },
});
