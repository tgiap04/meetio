import { ScrollView, StyleSheet, View } from 'react-native';
import { TranscriptEntry } from '../ui/transcript-entry';
import { EmptyState } from '../empty-state';
import { colors } from '../../theme/colors';
import type { TranscriptLine } from '../../mocks/types';

export interface TranscriptListProps {
  lines: readonly TranscriptLine[];
}

/**
 * Review-layout transcript turns with hairline dividers, or `EmptyState` when
 * a search query narrows the list to nothing. Rendered with `.map` over a
 * `ScrollView`, matching the list pattern already used by
 * `home/recent-meetings-section.tsx`, rather than introducing this codebase's
 * first `FlatList` for four fixture rows (YAGNI).
 */
export function TranscriptList({ lines }: TranscriptListProps) {
  if (lines.length === 0) {
    return <EmptyState description="Thử một từ khóa khác." title="Không tìm thấy kết quả phù hợp" />;
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      {lines.map((line, index) => (
        <View key={line.id}>
          {index > 0 ? <View style={styles.divider} /> : null}
          <TranscriptEntry
            text={line.text}
            timestamp={line.timestamp}
            variant="review"
          />
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingBottom: 8 },
  divider: { height: 1, backgroundColor: colors.border },
});
