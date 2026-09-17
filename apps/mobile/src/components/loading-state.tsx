import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';

interface LoadingStateProps {
  label?: string;
}

export function LoadingState({ label = 'Đang tải…' }: LoadingStateProps) {
  return (
    <View style={styles.container} testID="loading-state">
      <ActivityIndicator color={colors.primary} size="large" />
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  label: { ...typography.body, color: colors.textMuted },
});
