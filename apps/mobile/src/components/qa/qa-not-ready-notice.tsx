import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';

/**
 * Replaces the composer when the meeting hasn't finished processing yet
 * (409 MEETING_NOT_READY) — the thread stays readable, but input is disabled
 * until the meeting is ready.
 */
export function QaNotReadyNotice() {
  return (
    <View style={styles.container} testID="qa-not-ready-notice">
      <Text style={styles.text}>Cuộc họp chưa xử lý xong, chưa thể hỏi đáp.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, backgroundColor: colors.warningTint },
  text: { ...typography.body, color: colors.warning, textAlign: 'center' },
});
