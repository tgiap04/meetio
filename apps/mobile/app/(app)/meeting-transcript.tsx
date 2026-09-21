import { router, useLocalSearchParams } from 'expo-router';
import { TranscriptScreen } from '../../src/components/transcript/transcript-screen';

/**
 * Screen 09 — reached from screen 08's Transcript tab. `id` is accepted for
 * parity with that route's query-param contract (P07) but is not read here:
 * this phase renders the one fixture transcript regardless of which meeting
 * was tapped, per `clarifications.md` — real per-meeting transcripts are a
 * future, API-backed concern.
 */
export default function MeetingTranscriptScreen() {
  useLocalSearchParams<{ id?: string }>();

  return <TranscriptScreen onBack={() => router.back()} />;
}
