import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';

export interface LoadMoreButtonProps {
  loading: boolean;
  onPress: () => void;
}

/** "Tải thêm" footer for a Search-tab result section that has more pages. */
export function LoadMoreButton({ loading, onPress }: LoadMoreButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={loading}
      onPress={onPress}
      style={styles.button}
      testID="search-load-more"
    >
      {loading ? <ActivityIndicator color={colors.primary} size="small" /> : <Text style={styles.label}>Tải thêm</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { alignItems: 'center', paddingVertical: 10 },
  label: { ...typography.caption, fontWeight: '600', color: colors.primaryStrong },
});
