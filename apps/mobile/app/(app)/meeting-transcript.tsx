import { router, useLocalSearchParams } from 'expo-router';
import { RealTranscriptScreen } from '../../src/components/transcript/real-transcript-screen';
import { ErrorState } from '../../src/components/error-state';

/**
 * Screen 09 — reached from screen 08's Transcript tab, now wired to the real,
 * paged `/meetings/:id/segments` (US-23/24). `id` is required here (unlike
 * the earlier fixture build, which ignored it): there is no meaningful
 * transcript to show without knowing which meeting it belongs to.
 *
 * `seq` is optional and only set when this screen is reached from a Search
 * tab Transcript result (US-22, clarifications.md 2026-09-26): the screen
 * then opens scrolled to that segment instead of at the top.
 */
export default function MeetingTranscriptScreen() {
  const { id, seq } = useLocalSearchParams<{ id?: string; seq?: string }>();
  const parsedSeq = seq !== undefined ? Number(seq) : undefined;
  const initialSeq = parsedSeq !== undefined && Number.isFinite(parsedSeq) ? parsedSeq : undefined;

  if (!id) {
    return <ErrorState message="Không tìm thấy cuộc họp." onRetry={() => router.back()} />;
  }

  return <RealTranscriptScreen initialSeq={initialSeq} meetingId={id} onBack={() => router.back()} />;
}
