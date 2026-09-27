import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, ScrollView, StyleSheet } from 'react-native';
import { ScreenSurface } from '../../src/components/ui/screen-surface';
import { AiProcessingNotice } from '../../src/components/recording-done/ai-processing-notice';
import { RecordingDoneHero } from '../../src/components/recording-done/recording-done-hero';
import { MeetingProcessingStatus } from '../../src/components/meeting-detail/meeting-processing-status';
import { ScreenHeader } from '../../src/components/ui/screen-header';
import { PrimaryButton } from '../../src/components/primary-button';
import { useMeetingQuery } from '../../src/hooks/use-meeting-detail-query';
import { useMeetingRoomSocket } from '../../src/hooks/use-meeting-room-socket';
import { useReindexMeetingMutation } from '../../src/hooks/use-meeting-mutations';
import { MEETING_DETAIL_ROUTE } from '../../src/navigation/app-routes';
import { APP_HOME_ROUTE } from '../../src/navigation/route-guards';
import { colors } from '../../src/theme/colors';

/**
 * Screen 07 — reached once "Kết thúc" has synced every segment and the server accepted `end`
 * (US-16). Shows the real recorded duration and the pipeline's live progress (the room socket
 * refetches on every step, US-28). The transcript is readable right away: "Xem cuộc họp" opens
 * screen 08 without waiting for the AI.
 */
export default function RecordingDoneScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const meetingQuery = useMeetingQuery(id);
  useMeetingRoomSocket(id);
  const reindex = useReindexMeetingMutation(id ?? '');
  const meeting = meetingQuery.data;

  const openMeeting = () => id && router.replace({ pathname: MEETING_DETAIL_ROUTE, params: { id } });

  return (
    <ScreenSurface>
      <ScreenHeader onBack={() => router.replace(APP_HOME_ROUTE)} title="" />
      <ScrollView contentContainerStyle={styles.content}>
        <RecordingDoneHero durationSec={meeting?.duration_sec ?? null} />
        <AiProcessingNotice />
        {meeting ? (
          <MeetingProcessingStatus
            failureReason={meeting.failure_reason}
            onRetry={() => reindex.mutate({ scope: 'changed' })}
            processingSteps={meeting.processing_steps}
            retryLoading={reindex.isPending}
            status={meeting.status}
          />
        ) : (
          <ActivityIndicator color={colors.primary} />
        )}
        <PrimaryButton disabled={!id} label="Xem cuộc họp" onPress={openMeeting} />
      </ScrollView>
    </ScreenSurface>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 16 },
});
