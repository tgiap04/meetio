import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TranscriptList } from './transcript-list';
import { AudioPlayerBar } from './audio-player-bar';
import { ScreenHeader } from '../ui/screen-header';
import { SearchField } from '../ui/search-field';
import { AppIcon } from '../icons/app-icon';
import { colors } from '../../theme/colors';
import { TRANSCRIPT_LINES } from '../../mocks/transcript.mock';
import type { TranscriptLine } from '../../mocks/types';

export interface TranscriptScreenProps {
  onBack: () => void;
}

function matchesQuery(line: TranscriptLine, query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (normalizedQuery === '') {
    return true;
  }
  // Content only. There is no speaker name to search against — the recording
  // is one mixed ambient stream (US-13).
  return line.text.toLowerCase().includes(normalizedQuery);
}

/**
 * Screen 09 — the full transcript, an in-transcript search field, and a
 * pinned bottom audio player. Route wiring (`useLocalSearchParams`,
 * `router.back()`) lives in `app/(app)/meeting-transcript.tsx`; this
 * component takes `onBack` as a prop so it stays testable without mocking
 * `expo-router`.
 */
export function TranscriptScreen({ onBack }: TranscriptScreenProps) {
  const [query, setQuery] = useState('');

  const filteredLines = useMemo(
    () => TRANSCRIPT_LINES.filter((line) => matchesQuery(line, query)),
    [query],
  );

  return (
    <SafeAreaView style={styles.screen}>
      <ScreenHeader
        onBack={onBack}
        title="Transcript"
        trailing={
          // The pencil icon has no destination drawn or specified anywhere in
          // the design or clarifications — left deliberately inert and
          // reported in the phase hand-back rather than guessed at.
          <AppIcon color={colors.text} name="edit" size={22} testID="transcript-edit-icon" />
        }
      />
      <View style={styles.searchWrap}>
        <SearchField onChangeText={setQuery} placeholder="Tìm kiếm trong transcript..." value={query} />
      </View>
      <View style={styles.listWrap}>
        <TranscriptList lines={filteredLines} />
      </View>
      <AudioPlayerBar />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  searchWrap: { paddingHorizontal: 16, paddingBottom: 8 },
  listWrap: { flex: 1 },
});
