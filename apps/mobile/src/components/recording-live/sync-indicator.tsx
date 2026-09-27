import { StyleSheet, Text, View } from 'react-native';
import { AppIcon } from '../icons/app-icon';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';

export interface SyncIndicatorProps {
  pending: number;
  online: boolean;
}

/** US-14: "đã đồng bộ" / "đang chờ N đoạn" / "mất kết nối" — the transcript is safe on the phone either way. */
export function syncLabel({ pending, online }: SyncIndicatorProps): string {
  if (!online) return pending > 0 ? `Mất kết nối · ${pending} đoạn đang giữ trên máy` : 'Mất kết nối';
  return pending > 0 ? `Đang chờ đồng bộ ${pending} đoạn` : 'Đã đồng bộ';
}

export function SyncIndicator(props: SyncIndicatorProps) {
  const tone = !props.online ? colors.warning : props.pending > 0 ? colors.textMuted : colors.success;
  return (
    <View accessibilityLiveRegion="polite" style={styles.row} testID="sync-indicator">
      <AppIcon color={tone} name={props.online ? 'checkCircle' : 'offline'} size={14} />
      <Text style={[styles.text, { color: tone }]}>{syncLabel(props)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16 },
  text: { ...typography.caption },
});
