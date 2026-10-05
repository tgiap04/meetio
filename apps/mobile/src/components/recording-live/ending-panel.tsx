import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { PrimaryButton } from '../primary-button';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';

export interface EndingPanelProps {
  pending: number;
  online: boolean;
  onLeave: () => void;
  /** Phase 21: a line is still being translated on the device — `end` waits for it. */
  translating?: boolean;
}

export const TRANSLATING_LAST_LINE = 'Đang dịch nốt câu cuối…';

function syncMessage(online: boolean, pending: number): string {
  if (!online) return `${pending > 0 ? `${pending} đoạn` : 'Transcript'} được giữ an toàn trên máy và sẽ tự gửi khi có mạng.`;
  return pending > 0 ? `Đang đồng bộ ${pending} đoạn còn lại lên máy chủ…` : 'Đang báo máy chủ kết thúc cuộc họp…';
}

/**
 * US-16: "Kết thúc" succeeds only once every segment is on the server — until then this shows the
 * sync progress. Offline, the user may leave: the transcript stays on the phone and finishes
 * syncing by itself when the network is back (the meeting shows on Home meanwhile).
 */
export function EndingPanel({ pending, online, onLeave, translating = false }: EndingPanelProps) {
  return (
    <View style={styles.panel} testID="ending-panel">
      {online || translating ? <ActivityIndicator color={colors.primary} /> : null}
      <Text style={styles.title}>{online || translating ? 'Đang hoàn tất cuộc họp' : 'Chưa có kết nối mạng'}</Text>
      <Text style={styles.body}>
        {translating ? TRANSLATING_LAST_LINE : syncMessage(online, pending)}
      </Text>
      {!online && !translating ? <PrimaryButton label="Về trang chủ" onPress={onLeave} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { padding: 24, gap: 12, alignItems: 'center' },
  title: { ...typography.title, color: colors.text, textAlign: 'center' },
  body: { ...typography.body, color: colors.textMuted, textAlign: 'center' },
});
