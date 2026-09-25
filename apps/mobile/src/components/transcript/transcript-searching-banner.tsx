import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';

/** Shown while `useFetchAllPagesForSearch` is paging through the rest of a
 *  long transcript looking for a match search hasn't found yet (US-23). */
export function TranscriptSearchingBanner() {
  return (
    <View style={styles.banner} testID="transcript-searching-all-pages">
      <ActivityIndicator color={colors.primary} size="small" />
      <Text style={styles.label}>Đang tìm trong toàn bộ transcript…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 8 },
  label: { ...typography.caption, color: colors.textMuted },
});
