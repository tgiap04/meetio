import { router, useLocalSearchParams } from 'expo-router';
import { RealTranscriptScreen } from '../../src/components/transcript/real-transcript-screen';
import { ErrorState } from '../../src/components/error-state';

/**
 * Screen 09 — reached from screen 08's Transcript tab, now wired to the real,
 * paged `/meetings/:id/segments` (US-23/24). `id` is required here (unlike
 * the earlier fixture build, which ignored it): there is no meaningful
 * transcript to show without knowing which meeting it belongs to.
 */
export default function MeetingTranscriptScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();

  if (!id) {
    return <ErrorState message="Không tìm thấy cuộc họp." onRetry={() => router.back()} />;
  }

  return <RealTranscriptScreen meetingId={id} onBack={() => router.back()} />;
}
