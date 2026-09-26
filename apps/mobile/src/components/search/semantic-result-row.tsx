import type { SearchResultItem } from '@meetio/shared';
import { MeetingListRow } from '../ui/meeting-list-row';
import { formatOptionalDate } from '../../utils/meeting-formatting';

export interface SemanticResultRowProps {
  item: SearchResultItem;
  /** Opens the meeting's transcript scrolled to `segment_seq` (US-22,
   *  clarifications.md 2026-09-26). */
  onPress: (meetingId: string, segmentSeq: number) => void;
}

/** One `/search` result — a matching transcript excerpt, Search tab's
 *  Transcript chip (US-22). */
export function SemanticResultRow({ item, onPress }: SemanticResultRowProps) {
  return (
    <MeetingListRow
      leading="waveform"
      meta={formatOptionalDate(item.meeting_date)}
      onPress={() => onPress(item.meeting_id, item.segment_seq)}
      snippet={item.excerpt}
      title={item.meeting_title}
    />
  );
}
