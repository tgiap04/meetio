import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { PrimaryButton } from '../primary-button';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';

export interface EndingPanelProps {
  pending: number;
  online: boolean;
  onLeave: () => void;
}

/**
 * US-16: "Kết thúc" succeeds only once every segment is on the server — until then this shows the
 * sync progress. Offline, the user may leave: the transcript stays on the phone and finishes
 * syncing by itself when the network is back (the meeting shows on Home meanwhile).
 */
export function EndingPanel({ pending, online, onLeave }: EndingPanelProps) {
  return (
    <View style={styles.panel} testID="ending-panel">
      {online ? <ActivityIndicator color={colors.primary} /> : null}
      <Text style={styles.title}>{online ? 'Đang hoàn tất cuộc họp' : 'Chưa có kết nối mạng'}</Text>
      <Text style={styles.body}>
        {online
          ? pending > 0
            ? `Đang đồng bộ ${pending} đoạn còn lại lên máy chủ…`
            : 'Đang báo máy chủ kết thúc cuộc họp…'
          : `${pending > 0 ? `${pending} đoạn` : 'Transcript'} được giữ an toàn trên máy và sẽ tự gửi khi có mạng.`}
      </Text>
      {!online ? <PrimaryButton label="Về trang chủ" onPress={onLeave} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { padding: 24, gap: 12, alignItems: 'center' },
  title: { ...typography.title, color: colors.text, textAlign: 'center' },
  body: { ...typography.body, color: colors.textMuted, textAlign: 'center' },
});
