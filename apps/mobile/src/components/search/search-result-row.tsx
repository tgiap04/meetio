import { MeetingListRow } from '../ui/meeting-list-row';
import type { SearchResultItem } from '../../mocks/types';

export interface SearchResultRowProps {
  item: SearchResultItem;
  /** Called for `meeting` and `document` rows — both push to meeting detail
   *  (see `search.tsx` for why documents share that destination). Person rows
   *  never call this — the design defines no person screen. */
  onPress: (id: string) => void;
}

/**
 * One search-result row, discriminated on `item.kind`. A `switch` with no
 * `default` case means TypeScript's exhaustiveness check fails to compile if
 * a fourth `SearchResultItem` kind is ever added without a case here — that
 * is deliberate, not an oversight.
 */
export function SearchResultRow({ item, onPress }: SearchResultRowProps) {
  switch (item.kind) {
    case 'meeting':
      return (
        <MeetingListRow
          avatarInitials={undefined}
          badge={{ status: item.status }}
          leading="waveform"
          meta={`${item.durationMinutes} phút · ${item.date}`}
          onPress={() => onPress(item.id)}
          snippet={item.snippet}
          title={item.title}
        />
      );
    case 'document':
      return (
        <MeetingListRow
          badge={{ status: item.status }}
          leading="waveform"
          meta={`Liên quan: ${item.relatedTo}`}
          onPress={() => onPress(item.id)}
          title={item.title}
        />
      );
    case 'person':
      return (
        <MeetingListRow
          avatarInitials={item.initials}
          leading="avatar"
          meta={`Xuất hiện trong ${item.meetingCount} cuộc họp`}
          title={item.name}
        />
      );
    default: {
      // Exhaustiveness guard — a new SearchResultItem kind fails to compile here.
      const exhaustiveCheck: never = item;
      return exhaustiveCheck;
    }
  }
}
