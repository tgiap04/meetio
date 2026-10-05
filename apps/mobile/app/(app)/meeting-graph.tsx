import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import type { MeetingGraphEdge } from '@meetio/shared';
import { ScreenSurface } from '../../src/components/ui/screen-surface';
import { GraphCanvas } from '../../src/components/knowledge-graph/graph-canvas';
import { RelationList } from '../../src/components/knowledge-graph/relation-list';
import { selectVisibleGraphNodes } from '../../src/components/knowledge-graph/select-visible-graph-nodes';
import { filterRelationsForNode, toggleNodeSelection } from '../../src/components/knowledge-graph/graph-highlight';
import { FilterChipRow } from '../../src/components/ui/filter-chip-row';
import { ScreenHeader } from '../../src/components/ui/screen-header';
import { EmptyState } from '../../src/components/empty-state';
import { LoadingState } from '../../src/components/loading-state';
import { ErrorState } from '../../src/components/error-state';
import { useMeetingGraphQuery } from '../../src/hooks/use-meeting-graph-query';
import { getErrorMessage } from '../../src/api/error-messages';
import { ENTITIES_LIST_ROUTE, MEETING_TRANSCRIPT_ROUTE } from '../../src/navigation/app-routes';
import { ENTITY_TYPE_CHIPS, type EntityChipKey } from '../../src/utils/entity-type-labels';
import { typography } from '../../src/theme/typography';
import { colors } from '../../src/theme/colors';

/**
 * Screen 10 — real data (US-38), wired to `GET /meetings/:id/graph`. `id` is
 * required: with no meeting there is no graph to draw. Tapping a node
 * highlights its relations on the canvas and narrows the list below to them.
 */
export default function MeetingGraphScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [activeChip, setActiveChip] = useState<EntityChipKey>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const query = useMeetingGraphQuery(id ?? '', Boolean(id));

  function handleRelationPress(edge: MeetingGraphEdge) {
    router.push({
      pathname: MEETING_TRANSCRIPT_ROUTE,
      params: { id, seq: String(edge.segment_seq) },
    });
  }

  function handleViewDetailsPress() {
    router.push(ENTITIES_LIST_ROUTE);
  }

  function handleChipChange(key: string) {
    setActiveChip(key as EntityChipKey);
    // The selected node may not survive the new filter — start clean.
    setSelectedId(null);
  }

  function renderBody() {
    if (!id) {
      return <ErrorState message="Không tìm thấy cuộc họp." onRetry={() => router.back()} />;
    }
    if (query.isPending) {
      return <LoadingState label="Đang tải sơ đồ tri thức…" />;
    }
    if (query.isError || !query.data) {
      return <ErrorState message={getErrorMessage(query.error)} onRetry={() => query.refetch()} />;
    }
    if (query.data.nodes.length === 0) {
      return (
        <EmptyState
          description="Cuộc họp có thể đang xử lý, hoặc chưa nhắc tới thực thể nào."
          title="Chưa có dữ liệu sơ đồ tri thức"
        />
      );
    }

    const { nodes, edges, hiddenCount } = selectVisibleGraphNodes(query.data.nodes, query.data.edges, activeChip);
    const selectedNode = nodes.find((node) => node.id === selectedId) ?? null;
    const activeSelectedId = selectedNode?.id ?? null;

    return (
      <>
        {nodes.length === 0 ? (
          <EmptyState description="Thử một bộ lọc khác." title="Không có thực thể phù hợp" />
        ) : (
          <>
            <GraphCanvas
              edges={edges}
              nodes={nodes}
              onBackgroundPress={() => setSelectedId(null)}
              onNodePress={(nodeId) => setSelectedId((current) => toggleNodeSelection(current, nodeId))}
              selectedId={activeSelectedId}
            />
            {hiddenCount > 0 ? (
              <Text style={styles.truncationNote}>
                Chỉ hiển thị {nodes.length} thực thể được nhắc nhiều nhất — còn {hiddenCount} thực thể khác.
              </Text>
            ) : null}
          </>
        )}
        <RelationList
          nodes={query.data.nodes}
          onClearSelection={() => setSelectedId(null)}
          onRelationPress={handleRelationPress}
          onViewDetailsPress={handleViewDetailsPress}
          relations={filterRelationsForNode(query.data.edges, activeSelectedId)}
          selectedNodeName={selectedNode?.canonical_name ?? null}
        />
      </>
    );
  }

  return (
    <ScreenSurface>
      <ScreenHeader onBack={() => router.back()} title="Knowledge Graph" />
      <ScrollView contentContainerStyle={styles.content}>
        <FilterChipRow activeKey={activeChip} chips={[...ENTITY_TYPE_CHIPS]} onChange={handleChipChange} />
        {renderBody()}
      </ScrollView>
    </ScreenSurface>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingBottom: 24, gap: 16 },
  truncationNote: { ...typography.caption, color: colors.textMuted, textAlign: 'center' },
});
