import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';

export type StatusBadgeStatus = 'done' | 'processing' | 'queued' | 'failed';

const DEFAULT_LABEL: Record<StatusBadgeStatus, string> = {
  done: 'Đã xử lý',
  processing: 'Đang xử lý',
  queued: 'Chờ xử lý',
  failed: 'Thất bại',
};

const TINT: Record<StatusBadgeStatus, string> = {
  done: colors.successTint,
  processing: colors.warningTint,
  queued: colors.surface,
  failed: colors.danger,
};

const TEXT: Record<StatusBadgeStatus, string> = {
  done: colors.success,
  processing: colors.warning,
  queued: colors.textMuted,
  failed: colors.background,
};

export interface StatusBadgeProps {
  status: StatusBadgeStatus;
  /** Overrides the default Vietnamese label for this status. */
  label?: string;
}

/** Pill badge for a meeting/step's processing state — screen-04/07/08/12/13. */
export function StatusBadge({ status, label }: StatusBadgeProps) {
  return (
    <View style={[styles.pill, { backgroundColor: TINT[status] }]}>
      <Text style={[styles.label, { color: TEXT[status] }]}>{label ?? DEFAULT_LABEL[status]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, alignSelf: 'flex-start' },
  label: { ...typography.caption, fontWeight: '600' },
});
