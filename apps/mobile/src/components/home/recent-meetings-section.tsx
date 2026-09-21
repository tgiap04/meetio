import { StyleSheet, View } from 'react-native';
import { MeetingListRow } from '../ui/meeting-list-row';
import { SectionHeading } from '../ui/section-heading';
import type { Meeting } from '../../mocks/types';

export interface RecentMeetingsSectionProps {
  meetings: readonly Meeting[];
  onViewAllPress: () => void;
  onMeetingPress: (meetingId: string) => void;
}

/** "Cuộc họp gần đây" heading + the mocked recent-meeting rows. */
export function RecentMeetingsSection({ meetings, onViewAllPress, onMeetingPress }: RecentMeetingsSectionProps) {
  return (
    <View style={styles.container}>
      <SectionHeading onTrailingPress={onViewAllPress} title="Cuộc họp gần đây" trailingLabel="Xem tất cả" />
      <View style={styles.list}>
        {meetings.map((meeting) => (
          <MeetingListRow
            avatarInitials={meeting.initials}
            badge={{ status: meeting.status }}
            key={meeting.id}
            leading="avatar"
            meta={`${meeting.durationMinutes} phút · ${meeting.date}`}
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
