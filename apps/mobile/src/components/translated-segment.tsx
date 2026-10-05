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
  /**
   * `failed` (default): translation was tried and did not work — "Chưa dịch được" / "Thử lại".
   * `missing`: the line has no translation (never made, or its text was edited) — "Chưa có bản dịch" / "Dịch".
   */
  variant?: 'failed' | 'missing';
}

const COPY = {
  failed: { message: 'Chưa dịch được', action: 'Thử lại', accessibility: 'Thử lại dịch đoạn này' },
  missing: { message: 'Chưa có bản dịch', action: 'Dịch', accessibility: 'Dịch đoạn này' },
} as const;

/**
 * A line's translation (Phase 09), drawn apart from the original: pale-blue card, italic text.
 * A line with no translation shows "Chưa dịch được" with a small "Thử lại"; a line that is
 * merely still waiting shows nothing.
 */
export function TranslatedSegment({ text, failed = false, retrying = false, onRetry, error, variant = 'failed' }: TranslatedSegmentProps) {
  const copy = COPY[variant];
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
      <Text style={styles.failed}>{copy.message}</Text>
      {error ? <Text style={styles.failed}>{error}</Text> : null}
      {retrying ? (
        <Text style={styles.failed}>Đang dịch…</Text>
      ) : onRetry ? (
        <Pressable accessibilityLabel={copy.accessibility} accessibilityRole="button" hitSlop={8} onPress={onRetry}>
          <Text style={styles.retry}>{copy.action}</Text>
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
