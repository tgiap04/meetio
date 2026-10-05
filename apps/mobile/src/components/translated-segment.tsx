import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';

export interface TranslatedSegmentProps {
  /** The translation, once the server has one. */
  text: string | null;
  /** Translation gave up for this line — offer a manual retry. */
  failed?: boolean;
  retrying?: boolean;
  onRetry?: () => void;
  /** Why the last manual retry did not work. */
  error?: string | null;
}

/**
 * A line's translation (Phase 09), drawn apart from the original: pale-blue card, italic text.
 * A line whose translation failed shows "Chưa dịch được" with a small "Thử lại"; a line that is
 * merely still waiting shows nothing.
 */
export function TranslatedSegment({ text, failed = false, retrying = false, onRetry, error }: TranslatedSegmentProps) {
  if (text) {
    return (
      <View style={styles.card} testID="translated-segment">
        <Text style={styles.text}>{text}</Text>
      </View>
    );
  }
  if (!failed) return null;
  return (
    <View style={styles.card} testID="translation-failed">
      <Text style={styles.failed}>Chưa dịch được</Text>
      {error ? <Text style={styles.failed}>{error}</Text> : null}
      {retrying ? (
        <Text style={styles.failed}>Đang dịch…</Text>
      ) : onRetry ? (
        <Pressable accessibilityLabel="Thử lại dịch đoạn này" accessibilityRole="button" hitSlop={8} onPress={onRetry}>
          <Text style={styles.retry}>Thử lại</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.translationTint, borderRadius: 10, padding: 10, marginTop: 4, gap: 4 },
  text: { ...typography.body, color: colors.text, fontStyle: 'italic' },
  failed: { ...typography.caption, color: colors.textMuted },
  retry: { ...typography.label, color: colors.primaryStrong },
});
