import { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { SearchHeader } from '../../../src/components/search/search-header';
import { SearchResultSection } from '../../../src/components/search/search-result-section';
import { SearchField } from '../../../src/components/ui/search-field';
import { FilterChipRow } from '../../../src/components/ui/filter-chip-row';
import { SectionHeading } from '../../../src/components/ui/section-heading';
import { SEARCH_FIELD_PLACEHOLDER, SEARCH_GROUPS } from '../../../src/mocks';
import type { SearchGroup } from '../../../src/mocks/types';
import { MEETING_DETAIL_ROUTE } from '../../../src/navigation/app-routes';
import { colors } from '../../../src/theme/colors';

type KindFilterKey = 'all' | 'transcript' | 'node' | 'meeting';

// `FilterChipRow` (P01) declares `chips: FilterChip[]` as mutable, so this
// stays a plain array rather than `ReadonlyArray` — the values themselves are
// never mutated.
const CHIPS: Array<{ key: KindFilterKey; label: string }> = [
  { key: 'all', label: 'Tất cả' },
  { key: 'transcript', label: 'Transcript' },
  { key: 'node', label: 'Node' },
  { key: 'meeting', label: 'Meeting' },
];

/**
 * Chip → result-group mapping. The crop's four chips (Tất cả / Transcript /
 * Node / Meeting) do not map 1:1 onto the three result-group kinds this
 * screen renders (meeting / document / person) — that's a real gap the
 * design leaves unresolved (phase-11 Key Insight 3). Resolved here as:
 *   - "Meeting"    → the "Cuộc họp" (meeting) group
 *   - "Transcript" → the "Tài liệu" (document) group
 *   - "Node"       → the "Người" (person) group — "node" as in knowledge-graph node
 *   - "Tất cả"     → all three groups
 * Reported to P13 per the phase hand-back; do not re-derive this mapping
 * elsewhere without checking here first.
 */
const CHIP_GROUP_KINDS: Record<KindFilterKey, ReadonlyArray<SearchGroup['kind']>> = {
  all: ['meeting', 'document', 'person'],
  meeting: ['meeting'],
  transcript: ['document'],
  node: ['person'],
};

function matchesQuery(item: SearchGroup['items'][number], query: string): boolean {
  if (query.length === 0) {
    return true;
  }
  switch (item.kind) {
    case 'meeting':
      return item.title.toLowerCase().includes(query) || item.snippet.toLowerCase().includes(query);
    case 'document':
      return item.title.toLowerCase().includes(query) || item.relatedTo.toLowerCase().includes(query);
    case 'person':
      return item.name.toLowerCase().includes(query);
    default: {
      const exhaustiveCheck: never = item;
      return exhaustiveCheck;
    }
  }
}

/**
 * Search tab (screen-13). Cross-entity search over the in-memory
 * `SEARCH_GROUPS` fixture — no network call, so there is nothing here to
 * validate at a request boundary (see phase-11 Security Considerations).
 *
 * The funnel button beside the search field is deliberately inert: the
 * design draws it but defines no filter panel it opens. Reported to P13.
 */
export default function SearchScreen() {
  const [query, setQuery] = useState('');
  const [kindFilter, setKindFilter] = useState<KindFilterKey>('all');

  const normalizedQuery = query.trim().toLowerCase();
  const allowedKinds = CHIP_GROUP_KINDS[kindFilter];

  // The `as SearchGroup[]` cast below is needed because spreading a union
  // type decouples `kind` from `items` in TS's inferred type — at runtime
  // `items` is always filtered from the *same* group, so `kind` and `items`
  // stay correlated; the cast just restores that fact to the type checker.
  const visibleGroups = SEARCH_GROUPS.filter((group) => allowedKinds.includes(group.kind))
    .map((group) => ({ ...group, items: group.items.filter((item) => matchesQuery(item, normalizedQuery)) }))
    .filter((group) => group.items.length > 0) as SearchGroup[];

  function handleMeetingPress(id: string) {
    router.push({ pathname: MEETING_DETAIL_ROUTE, params: { id } });
  }

  function handleFilterPress() {
    // Intentionally inert — the design draws the funnel button but defines
    // no filter panel for it to open. Reported to P13.
  }

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <SearchHeader />
        <SearchField
          onChangeText={setQuery}
          onFilterPress={handleFilterPress}
          placeholder={SEARCH_FIELD_PLACEHOLDER}
          value={query}
        />
        <FilterChipRow
          activeKey={kindFilter}
          chips={CHIPS}
          onChange={(key) => setKindFilter(key as KindFilterKey)}
        />
        <SectionHeading title="Kết quả tìm kiếm" />
        {visibleGroups.map((group) => (
          <SearchResultSection group={group} key={group.id} onMeetingPress={handleMeetingPress} />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.surface },
  content: { padding: 20, gap: 16, paddingBottom: 32 },
});
