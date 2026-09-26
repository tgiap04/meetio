import { ScrollView, StyleSheet } from 'react-native';
import { ScreenSurface } from '../../../src/components/ui/screen-surface';
import { router } from 'expo-router';
import { useMeQuery } from '../../../src/hooks/use-me-query';
import { useRecentMeetingsQuery } from '../../../src/hooks/use-recent-meetings-query';
import { useActionFiltersQuery } from '../../../src/hooks/use-action-filters-query';
import { getErrorMessage } from '../../../src/api/error-messages';
import { LoadingState } from '../../../src/components/loading-state';
import { ErrorState } from '../../../src/components/error-state';
import { HomeHeader } from '../../../src/components/home/home-header';
import { StartRecordingCard } from '../../../src/components/home/start-recording-card';
import { SecondaryActionRow } from '../../../src/components/home/secondary-action-row';
import { RecentMeetingsSection } from '../../../src/components/home/recent-meetings-section';
import {
  ACTIONS_ROUTE,
  CONSENT_ROUTE,
  MEETING_DETAIL_ROUTE,
  RECORDING_SETUP_ROUTE,
  TAB_LIBRARY_ROUTE,
} from '../../../src/navigation/app-routes';
import { colors } from '../../../src/theme/colors';

/**
 * Home tab (screen-04). Half of this screen is real, half is mock — do not
 * assume either:
 *
 * - REAL: `useMeQuery`, the pending/error branches, the greeting name
 *   (`meQuery.data.user.display_name`), the consent gate
 *   (`recording_consent_at` → `/(app)/consent`) — this is the same US-04 legal
 *   gate the pre-design screen had, only its presentation changed — and the
 *   "Cuộc họp gần đây" list, now the real first page of `/meetings` (US-20)
 *   via `useRecentMeetingsQuery`.
 * - MOCK: the crown badge and the two original secondary action rows.
 *   Neither has a destination anywhere in the design, so they render visibly
 *   but are deliberately inert (see `home-header.tsx` / `secondary-action-row.tsx`).
 * - REAL (Phase 14): the third secondary row, "Việc cần làm · N đang mở" —
 *   the sole entry point into the cross-meeting action-item screen
 *   (clarifications.md 2026-09-26); `N` is `open_total` from
 *   `GET /actions/filters`, the exact count of every open item, assigned or
 *   not.
 */
export default function HomeScreen() {
  const meQuery = useMeQuery();
  const recentMeetingsQuery = useRecentMeetingsQuery();
  const actionFiltersQuery = useActionFiltersQuery();
  const openActionsCount = actionFiltersQuery.data?.open_total ?? 0;

  if (meQuery.isPending) {
    return <LoadingState />;
  }

  if (meQuery.isError) {
    return (
      <ErrorState message={getErrorMessage(meQuery.error)} onRetry={() => meQuery.refetch()} />
    );
  }

  const hasConsent = Boolean(meQuery.data.user.recording_consent_at);
  const recentMeetings = recentMeetingsQuery.data?.items ?? [];

  function handleStartRecordingPress() {
    router.push(hasConsent ? RECORDING_SETUP_ROUTE : CONSENT_ROUTE);
  }

  function handleViewAllPress() {
    router.push(TAB_LIBRARY_ROUTE);
  }

  function handleMeetingPress(meetingId: string) {
    router.push({ pathname: MEETING_DETAIL_ROUTE, params: { id: meetingId } });
  }

  return (
    <ScreenSurface>
      <ScrollView contentContainerStyle={styles.container} style={styles.scroll}>
        <HomeHeader displayName={meQuery.data.user.display_name} />

        <StartRecordingCard onPress={handleStartRecordingPress} />

        {/* Neither row has a destination in the design — inert by design, not by omission. */}
        <SecondaryActionRow icon="audioFile" label="Nhập từ file âm thanh" />
        <SecondaryActionRow icon="castDevice" label="Kết nối thiết bị khác" />
        <SecondaryActionRow
          icon="checkCircle"
          label={`Việc cần làm · ${openActionsCount} đang mở`}
          onPress={() => router.push(ACTIONS_ROUTE)}
        />

        <RecentMeetingsSection
          meetings={recentMeetings}
          onMeetingPress={handleMeetingPress}
          onViewAllPress={handleViewAllPress}
        />
      </ScrollView>
    </ScreenSurface>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.surface },
  container: { padding: 20, gap: 12, paddingBottom: 32 },
});
