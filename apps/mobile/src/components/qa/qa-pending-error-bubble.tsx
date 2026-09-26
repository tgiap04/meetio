import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';

export interface QaPendingErrorBubbleProps {
  message: string;
  onRetry: () => void;
}

/**
 * Renders when sending a question failed with a retryable error (429/503 —
 * MEETING_NOT_READY is handled separately, as a composer-disabling state,
 * not a bubble). Offers "Thử lại" right on the failed bubble.
 */
export function QaPendingErrorBubble({ message, onRetry }: QaPendingErrorBubbleProps) {
  return (
    <View style={styles.container} testID="qa-pending-error-bubble">
      <Text style={styles.text}>{message}</Text>
      <Pressable accessibilityRole="button" onPress={onRetry} style={styles.retry} testID="qa-pending-retry">
        <Text style={styles.retryLabel}>Thử lại</Text>
      </Pressable>
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
    gap: 8,
  },
  text: { ...typography.body, color: colors.danger },
  retry: { alignSelf: 'flex-start' },
  retryLabel: { ...typography.button, color: colors.primaryStrong },
});
