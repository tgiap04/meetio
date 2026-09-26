import { View } from 'react-native';
import type { EntityMeeting } from '@meetio/shared';
import { MeetingListRow } from '../ui/meeting-list-row';
import { SectionHeading } from '../ui/section-heading';
import { formatOptionalDate } from '../../utils/meeting-formatting';

export interface EntityMeetingsListProps {
  meetings: readonly EntityMeeting[];
  onMeetingPress: (meetingId: string) => void;
}

/** The entity-detail screen's "Xuất hiện trong" section — every meeting that
 *  mentions this entity, tapping opens that meeting's detail screen. */
export function EntityMeetingsList({ meetings, onMeetingPress }: EntityMeetingsListProps) {
  if (meetings.length === 0) {
    return null;
  }

  return (
    <View style={{ gap: 8 }}>
      <SectionHeading title={`Xuất hiện trong ${meetings.length} cuộc họp`} />
      {meetings.map((meeting) => (
        <MeetingListRow
          key={meeting.id}
          leading="waveform"
          meta={`${formatOptionalDate(meeting.started_at)} · ${meeting.mention_count} lượt nhắc`}
          onPress={() => onMeetingPress(meeting.id)}
          title={meeting.title}
        />
      ))}
    </View>
  );
}
