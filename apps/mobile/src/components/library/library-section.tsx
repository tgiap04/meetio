import { StyleSheet, View } from 'react-native';
import { MeetingListRow } from '../ui/meeting-list-row';
import { SectionHeading } from '../ui/section-heading';
import type { Meeting } from '../../mocks/types';

export interface LibrarySectionProps {
  title: string;
  meetings: readonly Meeting[];
  onMeetingPress: (meetingId: string) => void;
}

/**
 * One Library date-group: a `SectionHeading` plus its waveform-leading
 * meeting rows. Renders nothing at all when `meetings` is empty, so a
 * section the active filter/search emptied doesn't leave a heading hanging
 * over blank space.
 */
export function LibrarySection({ title, meetings, onMeetingPress }: LibrarySectionProps) {
  if (meetings.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      <SectionHeading title={title} />
      <View style={styles.list}>
        {meetings.map((meeting) => (
          <MeetingListRow
            badge={{ status: meeting.status }}
            key={meeting.id}
            leading="waveform"
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
