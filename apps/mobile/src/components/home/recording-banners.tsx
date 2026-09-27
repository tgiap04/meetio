import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRecordingStore } from '../../recording/recording.store';
import { endUnfinishedMeeting, resumeUnfinishedMeeting, type UnfinishedMeeting } from '../../recording/recording-recovery';
import { useUnfinishedMeetings } from '../../hooks/use-unfinished-meetings';
import { useElapsedClock } from '../../hooks/use-elapsed-clock';
import { RECORDING_LIVE_ROUTE } from '../../navigation/app-routes';
import { ActiveRecordingBanner } from './active-recording-banner';
import { UnfinishedMeetingBanner } from './unfinished-meeting-banner';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';

export interface RecordingBannersProps {
  ownerId: string;
}

/**
 * Top of Home: the recording in progress (minimised), then every unfinished meeting (US-15).
 * Only one recording at a time — "Tiếp tục ghi" is disabled while another one is live.
 */
export function RecordingBanners({ ownerId }: RecordingBannersProps) {
  const phase = useRecordingStore((s) => s.phase);
  const elapsed = useElapsedClock();
  const { meetings, refresh } = useUnfinishedMeetings();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act(meeting: UnfinishedMeeting, action: 'resume' | 'end') {
    setBusy(true);
    setError(null);
    try {
      if (action === 'resume') {
        await resumeUnfinishedMeeting(meeting, ownerId);
        router.push(RECORDING_LIVE_ROUTE);
      } else {
        await endUnfinishedMeeting(meeting);
      }
    } catch {
      setError(action === 'resume' ? 'Không tiếp tục được cuộc họp này.' : 'Chưa kết thúc được — kiểm tra kết nối rồi thử lại.');
    } finally {
      setBusy(false);
      void refresh();
    }
  }

  if (phase === 'idle' && meetings.length === 0) return null;
  return (
    <View style={styles.stack}>
      {phase !== 'idle' ? <ActiveRecordingBanner elapsed={elapsed} onPress={() => router.push(RECORDING_LIVE_ROUTE)} phase={phase} /> : null}
      {meetings.map((meeting) => (
        <UnfinishedMeetingBanner
          busy={busy || phase !== 'idle'}
          key={meeting.id}
          meeting={meeting}
          onEnd={() => void act(meeting, 'end')}
          onResume={() => void act(meeting, 'resume')}
        />
      ))}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 12 },
  error: { ...typography.caption, color: colors.danger },
});
