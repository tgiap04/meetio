import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { AppIcon } from '../../src/components/icons/app-icon';
import { ActionItemsSection } from '../../src/components/meeting-detail/action-items-section';
import { MeetingHero } from '../../src/components/meeting-detail/meeting-hero';
import { MeetingSummarySection } from '../../src/components/meeting-detail/meeting-summary-section';
import { ScreenHeader } from '../../src/components/ui/screen-header';
import { SegmentedTabs } from '../../src/components/ui/segmented-tabs';
import { ACTION_ITEMS, MEETINGS, MEETING_SUMMARY } from '../../src/mocks';
import { MEETING_GRAPH_ROUTE, MEETING_TRANSCRIPT_ROUTE } from '../../src/navigation/app-routes';
import { colors } from '../../src/theme/colors';

/** The two tabs that swap content in place. Kept narrower than the full tab
 *  row so the active-tab state can never land on a navigating tab. */
type ContentTabKey = 'summary' | 'action-items';

const TAB_ITEMS = [
  { key: 'summary', label: 'Tóm tắt' },
  { key: 'action-items', label: 'Action Items' },
  { key: 'transcript', label: 'Transcript' },
  { key: 'graph', label: 'Graph' },
];

/**
 * Screen 08 — the hub every recording/meeting flow converges on. Route shape
 * is deliberately flat (`?id=`, not `[id]/`): a dynamic segment here would be
 * co-owned by this phase and the transcript/graph phases, breaking the
 * parallel-phase file-ownership rule (see phase-07's Key Insights §4).
 *
 * The four-tab row is heterogeneous: Tóm tắt and Action Items render content
 * in place, Transcript and Graph push their own routes (clarifications.md
 * §6). The active tab is therefore restricted to the two content keys so
 * popping back from Transcript/Graph always lands on a rendered tab.
 */
export default function MeetingDetailScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const meeting = useMemo(() => MEETINGS.find((candidate) => candidate.id === id) ?? MEETINGS[0], [id]);
  const [activeContentTab, setActiveContentTab] = useState<ContentTabKey>('summary');
  const [checkedIds, setCheckedIds] = useState<ReadonlySet<string>>(new Set());

  function handleTabChange(key: string) {
    if (key === 'summary' || key === 'action-items') {
      setActiveContentTab(key);
      return;
    }
    if (key === 'transcript') {
      router.push({ pathname: MEETING_TRANSCRIPT_ROUTE, params: { id: meeting.id } });
      return;
    }
    if (key === 'graph') {
      router.push({ pathname: MEETING_GRAPH_ROUTE, params: { id: meeting.id } });
    }
  }

  function toggleActionItem(itemId: string) {
    setCheckedIds((previous) => {
      const next = new Set(previous);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader
        onBack={() => router.back()}
        title="Chi tiết cuộc họp"
        trailing={
          // The design draws a kebab with no menu behind it (Key Insights §5)
          // — inert and labelled as such, not wired to anything.
          <Pressable accessibilityLabel="Menu (chưa khả dụng)" accessibilityState={{ disabled: true }} disabled testID="meeting-detail-kebab">
            <AppIcon color={colors.text} name="more" size={22} />
          </Pressable>
        }
      />
      <ScrollView contentContainerStyle={styles.content}>
        <MeetingHero meeting={meeting} />
        <SegmentedTabs activeKey={activeContentTab} items={TAB_ITEMS} onChange={handleTabChange} />
        {activeContentTab === 'summary' ? <MeetingSummarySection summary={MEETING_SUMMARY} /> : null}
        <ActionItemsSection checkedIds={checkedIds} items={ACTION_ITEMS} onToggle={toggleActionItem} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  content: { padding: 16, gap: 20 },
});
