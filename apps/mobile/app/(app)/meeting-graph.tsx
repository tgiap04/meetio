import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { GraphCanvas } from '../../src/components/knowledge-graph/graph-canvas';
import { RelationList } from '../../src/components/knowledge-graph/relation-list';
import { FilterChipRow, type FilterChip } from '../../src/components/ui/filter-chip-row';
import { ScreenHeader } from '../../src/components/ui/screen-header';
import { GRAPH_EDGES, GRAPH_NODES, GRAPH_RELATIONS } from '../../src/mocks';
import type { GraphNodeType } from '../../src/mocks/types';
import { colors } from '../../src/theme/colors';

type FilterKey = GraphNodeType | 'all';

const CHIPS: (FilterChip & { key: FilterKey })[] = [
  { key: 'all', label: 'Tất cả' },
  { key: 'person', label: 'Person' },
  { key: 'project', label: 'Project' },
  { key: 'task', label: 'Task' },
];

/**
 * Screen 10 — reached from screen 08's Graph tab (clarifications.md §6: a
 * separate route with its own header/back chevron, not a tab inside screen
 * 08). Static node-and-edge diagram, drawn with rotated `View`s rather than
 * `react-native-svg` — see `graph-canvas.tsx`.
 *
 * `id` is accepted for parity with screen 08's `?id=` push contract (P07)
 * and with `meeting-transcript.tsx`'s sibling screen — added by P13's tap
 * audit, which found this screen silently dropped the param screen 09
 * declares. Not read here: this phase renders the one fixture graph
 * regardless of which meeting was tapped, same as transcript.
 */
export default function MeetingGraphScreen() {
  useLocalSearchParams<{ id?: string }>();
  const [activeType, setActiveType] = useState<FilterKey>('all');

  return (
    <View style={styles.screen}>
      <ScreenHeader onBack={() => router.back()} title="Knowledge Graph" />
      <ScrollView contentContainerStyle={styles.content}>
        <FilterChipRow activeKey={activeType} chips={CHIPS} onChange={(key) => setActiveType(key as FilterKey)} />
        <GraphCanvas activeType={activeType} edges={GRAPH_EDGES} nodes={GRAPH_NODES} />
        <RelationList nodes={GRAPH_NODES} relations={GRAPH_RELATIONS} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  content: { paddingHorizontal: 16, paddingBottom: 24, gap: 20 },
});
