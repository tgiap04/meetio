import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import type { UnfinishedMeeting } from '../../recording/recording-recovery';
import { PrimaryButton } from '../primary-button';
import { SecondaryButton } from '../ui/secondary-button';
import { SurfaceCard } from '../ui/surface-card';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';

const formatStart = (ms: number) =>
  new Date(ms).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });

export interface UnfinishedMeetingBannerProps {
  meeting: UnfinishedMeeting;
  busy: boolean;
  onResume: () => void;
  onEnd: () => void;
}

/** US-15: "Có cuộc họp chưa kết thúc" with its start time — continue recording it, or end it. */
export function UnfinishedMeetingBanner({ meeting, busy, onResume, onEnd }: UnfinishedMeetingBannerProps) {
  if (meeting.state === 'ending') {
    return (
      <SurfaceCard style={styles.card} testID={`unfinished-${meeting.id}`}>
        <View style={styles.syncRow}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.body}>
            Cuộc họp lúc {formatStart(meeting.startedAt)} đang đồng bộ{meeting.pending > 0 ? ` ${meeting.pending} đoạn còn lại` : ''} — sẽ tự
            hoàn tất khi có mạng.
          </Text>
        </View>
      </SurfaceCard>
    );
  }
  return (
    <SurfaceCard style={styles.card} testID={`unfinished-${meeting.id}`}>
      <Text style={styles.title}>Có cuộc họp chưa kết thúc</Text>
      <Text style={styles.body}>
        Bắt đầu lúc {formatStart(meeting.startedAt)}
        {meeting.pending > 0 ? ` · ${meeting.pending} đoạn chưa đồng bộ, vẫn giữ trên máy` : ''}
      </Text>
      <View style={styles.actions}>
        <View style={styles.action}>
          <SecondaryButton disabled={busy} label="Kết thúc" onPress={onEnd} />
        </View>
        <View style={styles.action}>
          <PrimaryButton disabled={busy} label="Tiếp tục ghi" onPress={onResume} />
        </View>
      </View>
    </SurfaceCard>
  );
}

const styles = StyleSheet.create({
  card: { gap: 8, padding: 16, borderWidth: 1, borderColor: colors.primaryTint },
  title: { ...typography.title, color: colors.text },
  body: { ...typography.caption, color: colors.textMuted, flexShrink: 1 },
  syncRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  actions: { flexDirection: 'row', gap: 12, marginTop: 4 },
  action: { flex: 1 },
});
