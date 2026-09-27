import { useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import type { LiveLine } from '../../recording/recording.store';
import { formatGapLabel, formatSegmentTimestamp } from '../../utils/segment-formatting';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';

/** Within this many points of the end counts as "reading the newest line". */
export const FOLLOW_THRESHOLD = 48;

export function isNearBottom({ contentOffset, contentSize, layoutMeasurement }: NativeScrollEvent): boolean {
  return contentSize.height - (contentOffset.y + layoutMeasurement.height) <= FOLLOW_THRESHOLD;
}

export interface LiveTranscriptListProps {
  lines: readonly LiveLine[];
  /** The utterance still being recognised — drawn in a different colour (US-08). */
  partial: string | null;
}

/**
 * The live transcript (US-08). Follows the newest line — until the user scrolls up to read, then
 * it stays put and offers "Xuống dòng mới nhất" with the count of lines that arrived meanwhile.
 * Every interruption shows as a gap marker, never silently joined (US-10). Virtualised FlatList,
 * like the Phase 10 transcript, so a 60-minute meeting stays smooth.
 */
export function LiveTranscriptList({ lines, partial }: LiveTranscriptListProps) {
  const list = useRef<FlatList<LiveLine>>(null);
  const [following, setFollowing] = useState(true);
  const [unread, setUnread] = useState(0);
  const seen = useRef(lines.length);

  useEffect(() => {
    const added = lines.length - seen.current;
    seen.current = lines.length;
    if (following) list.current?.scrollToEnd({ animated: true });
    else if (added > 0) setUnread((n) => n + added);
  }, [lines.length, partial, following]);

  function handleScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const atBottom = isNearBottom(event.nativeEvent);
    setFollowing(atBottom);
    if (atBottom) setUnread(0);
  }

  function jumpToNewest() {
    setUnread(0);
    setFollowing(true);
    list.current?.scrollToEnd({ animated: true });
  }

  return (
    <View style={styles.wrap}>
      <FlatList
        ref={list}
        contentContainerStyle={styles.content}
        data={lines}
        keyExtractor={(line) => String(line.seq)}
        ListEmptyComponent={partial ? null : <Text style={styles.empty}>Hãy bắt đầu nói — chữ sẽ hiện ở đây.</Text>}
        ListFooterComponent={partial ? <Text style={styles.partial} testID="live-partial">{partial}</Text> : null}
        onScrollBeginDrag={handleScroll}
        onMomentumScrollEnd={handleScroll}
        onScrollEndDrag={handleScroll}
        renderItem={({ item }) => (
          <View style={styles.line}>
            {item.gapBeforeMs !== null ? <Text style={styles.gap}>{formatGapLabel(item.gapBeforeMs)}</Text> : null}
            <Text style={styles.timestamp}>{formatSegmentTimestamp(item.startedAtMs)}</Text>
            <Text style={styles.text}>{item.text}</Text>
          </View>
        )}
        testID="live-transcript-list"
      />
      {!following && unread > 0 ? (
        <Pressable accessibilityRole="button" onPress={jumpToNewest} style={styles.jump} testID="jump-to-newest">
          <Text style={styles.jumpText}>Xuống dòng mới nhất ({unread})</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  content: { padding: 16, gap: 12 },
  empty: { ...typography.body, color: colors.textMuted, textAlign: 'center', marginTop: 24 },
  line: { gap: 2 },
  gap: { ...typography.caption, color: colors.warning, textAlign: 'center', marginBottom: 6 },
  timestamp: { ...typography.caption, color: colors.textMuted },
  text: { ...typography.body, color: colors.text },
  partial: { ...typography.body, color: colors.textMuted, fontStyle: 'italic', marginTop: 12 },
  jump: {
    position: 'absolute',
    bottom: 16,
    alignSelf: 'center',
    backgroundColor: colors.primary,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  jumpText: { ...typography.label, color: colors.primaryText },
});
