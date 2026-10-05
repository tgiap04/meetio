import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { MeetingDetailResponse } from '@meetio/shared';
import { AppIcon } from '../icons/app-icon';
import { StatusBadge } from '../ui/status-badge';
import { SurfaceCard } from '../ui/surface-card';
import { toStatusBadgeStatus } from '../ui/meeting-status-badge-mapping';
import { formatMeetingMeta } from '../../utils/meeting-formatting';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';

export interface MeetingDetailHeroProps {
  meeting: MeetingDetailResponse;
  /** Opens the shared rename dialog. */
  onRenamePress: () => void;
  hasUnprocessedEdits: boolean;
}

/**
 * Real-data hero card for screen 08 (US-25): calendar tile, the meeting title
 * with a pencil button that opens the shared rename dialog, the
 * "date/time · duration" meta line, and the status badge.
 */
export function MeetingDetailHero({ meeting, onRenamePress, hasUnprocessedEdits }: MeetingDetailHeroProps) {
  return (
    <SurfaceCard style={styles.card}>
      <View style={styles.row}>
        <View style={styles.tile}>
          <AppIcon color={colors.text} name="calendar" size={24} />
        </View>
        <View style={styles.body}>
          <View style={styles.titleRow}>
            <Text numberOfLines={2} style={styles.title}>
              {meeting.title}
            </Text>
            <Pressable
              accessibilityLabel="Đổi tên cuộc họp"
              accessibilityRole="button"
              hitSlop={4}
              onPress={onRenamePress}
              style={styles.renameButton}
            >
              <AppIcon color={colors.textMuted} name="edit" size={18} />
            </Pressable>
          </View>
          <Text style={styles.meta}>{formatMeetingMeta(meeting)}</Text>
        </View>
        <StatusBadge status={toStatusBadgeStatus(meeting.status)} />
      </View>
      {hasUnprocessedEdits ? (
        <Text style={styles.unprocessedNotice}>
          Bản tóm tắt đang cập nhật theo các chỉnh sửa transcript gần đây.
        </Text>
      ) : null}
    </SurfaceCard>
  );
}

const styles = StyleSheet.create({
  card: { gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  tile: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, gap: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  title: { ...typography.sectionTitle, color: colors.text, flexShrink: 1 },
  renameButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginVertical: -10 },
  meta: { ...typography.caption, color: colors.textMuted },
  unprocessedNotice: { ...typography.caption, color: colors.warning },
});
