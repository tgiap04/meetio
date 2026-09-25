import { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
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
  onTitleSave: (title: string) => void;
  hasUnprocessedEdits: boolean;
}

/**
 * Real-data hero card for screen 08 (US-25): calendar tile, an always-editable
 * title field that autosaves on blur, the "date/time · duration" meta line,
 * and the status badge. A blank save reverts to the server's default
 * time-based title (`updateMeeting` contract) — this component only sends
 * whatever text is in the field, trimmed, and lets the server own that rule.
 */
export function MeetingDetailHero({ meeting, onTitleSave, hasUnprocessedEdits }: MeetingDetailHeroProps) {
  const [draftTitle, setDraftTitle] = useState(meeting.title);

  // The server title can change out from under the field (another device's
  // edit, or a blank-title revert) — resync whenever it does, but only while
  // the user isn't actively typing a different value already in flight.
  useEffect(() => {
    setDraftTitle(meeting.title);
  }, [meeting.title]);

  function handleBlur() {
    if (draftTitle.trim() !== meeting.title) {
      onTitleSave(draftTitle.trim());
    }
  }

  return (
    <SurfaceCard style={styles.card}>
      <View style={styles.row}>
        <View style={styles.tile}>
          <AppIcon color={colors.text} name="calendar" size={24} />
        </View>
        <View style={styles.body}>
          <TextInput
            accessibilityLabel="Tiêu đề cuộc họp"
            onBlur={handleBlur}
            onChangeText={setDraftTitle}
            style={styles.title}
            value={draftTitle}
          />
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
  title: { ...typography.sectionTitle, color: colors.text, padding: 0 },
  meta: { ...typography.caption, color: colors.textMuted },
  unprocessedNotice: { ...typography.caption, color: colors.warning },
});
