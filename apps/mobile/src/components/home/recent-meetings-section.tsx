import { StyleSheet, View } from 'react-native';
import type { MeetingListItem } from '@meetio/shared';
import { MeetingListRow } from '../ui/meeting-list-row';
import { SectionHeading } from '../ui/section-heading';
import { toStatusBadgeStatus } from '../ui/meeting-status-badge-mapping';
import { formatMeetingMeta, initialsFromTitle } from '../../utils/meeting-formatting';

export interface RecentMeetingsSectionProps {
  meetings: readonly MeetingListItem[];
  onViewAllPress: () => void;
  onMeetingPress: (meetingId: string) => void;
}

/** "Cuộc họp gần đây" heading + the real first page of `/meetings` (US-20). */
export function RecentMeetingsSection({ meetings, onViewAllPress, onMeetingPress }: RecentMeetingsSectionProps) {
  return (
    <View style={styles.container}>
      <SectionHeading onTrailingPress={onViewAllPress} title="Cuộc họp gần đây" trailingLabel="Xem tất cả" />
      <View style={styles.list}>
        {meetings.map((meeting) => (
          <MeetingListRow
            avatarInitials={initialsFromTitle(meeting.title)}
            badge={{ status: toStatusBadgeStatus(meeting.status) }}
            key={meeting.id}
            leading="avatar"
            meta={formatMeetingMeta(meeting)}
            onPress={() => onMeetingPress(meeting.id)}
            title={meeting.title}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 12 },
  list: { gap: 2 },
});
