import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SurfaceCard } from '../ui/surface-card';
import { SectionHeading } from '../ui/section-heading';
import { LoadingState } from '../loading-state';
import { ErrorState } from '../error-state';
import { useEntityTimelineQuery } from '../../hooks/use-entity-timeline-query';
import { getErrorMessage } from '../../api/error-messages';
import { formatOptionalDate } from '../../utils/meeting-formatting';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';

export interface EntityTimelineSectionProps {
  entityId: string;
  /** Opens the transcript of that timeline item's citation (US-39). */
  onItemPress: (meetingId: string, segmentSeq: number) => void;
}

/**
 * The entity-detail screen's "Dòng thời gian" section (US-39) — paged
 * `GET /entities/:id/timeline`, oldest meeting first. Owns its own query so
 * the parent screen's initial paint isn't blocked on this section's data.
 */
export function EntityTimelineSection({ entityId, onItemPress }: EntityTimelineSectionProps) {
  const query = useEntityTimelineQuery(entityId);
  const items = query.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <View style={styles.container}>
      <SectionHeading title="Dòng thời gian" />
      {query.isPending ? <LoadingState label="Đang tải dòng thời gian…" /> : null}
      {query.isError ? (
        <ErrorState message={getErrorMessage(query.error)} onRetry={() => query.refetch()} />
      ) : null}
      {!query.isPending && !query.isError && items.length === 0 ? (
        <Text style={styles.empty}>Chưa có mốc thời gian nào.</Text>
      ) : null}
      {items.length > 0 ? (
        <SurfaceCard>
          {items.map((item, index) => (
            <Pressable
              accessibilityRole="button"
              key={`${item.chunk_id}-${item.segment_seq}`}
              onPress={() => onItemPress(item.meeting_id, item.segment_seq)}
              style={[styles.row, index > 0 && styles.rowDivider]}
            >
              <Text style={styles.meetingTitle}>{item.meeting_title}</Text>
              <Text style={styles.date}>{formatOptionalDate(item.meeting_date)}</Text>
              <Text numberOfLines={2} style={styles.excerpt}>
                {item.excerpt}
              </Text>
            </Pressable>
          ))}
        </SurfaceCard>
      ) : null}
      {query.hasNextPage ? (
        <Pressable
          accessibilityRole="button"
          disabled={query.isFetchingNextPage}
          onPress={() => query.fetchNextPage()}
          style={styles.loadMore}
          testID="timeline-load-more"
        >
          <Text style={styles.loadMoreLabel}>{query.isFetchingNextPage ? 'Đang tải…' : 'Tải thêm'}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8 },
  row: { paddingVertical: 10, gap: 4 },
  rowDivider: { borderTopWidth: 1, borderTopColor: colors.border },
  meetingTitle: { ...typography.label, color: colors.text },
  date: { ...typography.caption, color: colors.textMuted },
  excerpt: { ...typography.body, color: colors.text, fontStyle: 'italic' },
  empty: { ...typography.body, color: colors.textMuted },
  loadMore: { alignItems: 'center', paddingVertical: 10 },
  loadMoreLabel: { ...typography.caption, fontWeight: '600', color: colors.primaryStrong },
});
