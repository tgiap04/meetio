import { StyleSheet, View } from 'react-native';
import { SearchResultRow } from './search-result-row';
import { SectionHeading } from '../ui/section-heading';
import type { SearchGroup } from '../../mocks/types';

export interface SearchResultSectionProps {
  group: SearchGroup;
  onMeetingPress: (id: string) => void;
}

/**
 * One result group ("Cuộc họp (N)", "Tài liệu (N)", "Người (N)"). The count
 * in the heading is always `group.items.length` — never a literal — so the
 * heading can never disagree with the rows drawn beneath it. That is the
 * direct fix for the design's own "Cuộc họp (3)" heading over 2 rows (see
 * phase-11 Key Insight 2).
 */
export function SearchResultSection({ group, onMeetingPress }: SearchResultSectionProps) {
  return (
    <View style={styles.container}>
      <SectionHeading title={`${group.label} (${group.items.length})`} />
      <View style={styles.list}>
        {group.items.map((item) => (
          <SearchResultRow item={item} key={item.id} onPress={onMeetingPress} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8 },
  list: { gap: 2 },
});
