import { useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import type { LiveLine, LiveTranslation } from '../../recording/recording.store';
import { TranslatedSegment } from '../translated-segment';
import { formatGapLabel, formatSegmentTimestamp } from '../../utils/segment-formatting';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';

/** Within this many points of the end counts as "reading the newest line". */
export const FOLLOW_THRESHOLD = 48;

/** Space under the last line so long text never hugs the screen edge (the screen surface adds the device's bottom inset). */
export const LIVE_LIST_BOTTOM_PADDING = 48;

export function isNearBottom({ contentOffset, contentSize, layoutMeasurement }: NativeScrollEvent): boolean {
  return contentSize.height - (contentOffset.y + layoutMeasurement.height) <= FOLLOW_THRESHOLD;
}

export interface LiveTranscriptListProps {
  lines: readonly LiveLine[];
  /** The utterance still being recognised — drawn in a different colour (US-08). */
  partial: string | null;
  /** Phase 21: on-device translations by seq, drawn under their line. Absent = translation is not in play. */
  translations?: Readonly<Record<number, LiveTranslation>>;
  onRetryTranslation?: (seq: number) => void;
  /** Seqs whose manual retry is running, and why the last one failed. */
  retryingTranslations?: ReadonlySet<number>;
  translationErrors?: Readonly<Record<number, string>>;
}

/**
 * The live transcript (US-08). Follows the newest line — until the user scrolls up to read, then
 * it stays put and offers "Xuống dòng mới nhất" with the count of lines that arrived meanwhile.
 * Following scrolls on `onContentSizeChange`, i.e. after the new line (or a growing partial, or a
 * translation landing under a line) has been laid out — scrolling from an effect would run before
 * layout and stop one line short. Only the user's own drag can stop following: momentum from a
 * programmatic scroll must not read as "the user scrolled up".
 * Every interruption shows as a gap marker, never silently joined (US-10). Virtualised FlatList,
 * like the Phase 10 transcript, so a 60-minute meeting stays smooth.
 */
export function LiveTranscriptList({ lines, partial, translations, onRetryTranslation, retryingTranslations, translationErrors }: LiveTranscriptListProps) {
  const list = useRef<FlatList<LiveLine>>(null);
  const [following, setFollowing] = useState(true);
  const followingRef = useRef(true);
  const dragging = useRef(false);
  const [unread, setUnread] = useState(0);
  const seen = useRef(lines.length);
  // Lines count at the last follow-scroll: a new line glides into view, a growing partial snaps
  // (restarting an animation several times a second makes the list judder on Android).
  const scrolledAtLength = useRef(lines.length);

  const follow = (value: boolean) => {
    followingRef.current = value;
    setFollowing(value);
  };

  useEffect(() => {
    const added = lines.length - seen.current;
    seen.current = lines.length;
    if (!followingRef.current && added > 0) setUnread((n) => n + added);
  }, [lines.length]);

  function handleContentSizeChange() {
    if (!followingRef.current) return;
    const animated = lines.length !== scrolledAtLength.current;
    scrolledAtLength.current = lines.length;
    list.current?.scrollToEnd({ animated });
  }

  function handleDragStart() {
    dragging.current = true;
  }

  function handleScrollSettled(event: NativeSyntheticEvent<NativeScrollEvent>) {
    if (!dragging.current) return;
    const atBottom = isNearBottom(event.nativeEvent);
    follow(atBottom);
    if (atBottom) setUnread(0);
  }

  function handleDragEnd(event: NativeSyntheticEvent<NativeScrollEvent>) {
    handleScrollSettled(event);
    // Released without a fling: no momentum end will follow, so the drag is over now — otherwise a
    // later programmatic scroll's momentum end would still be judged as the user's.
    if (Math.abs(event.nativeEvent.velocity?.y ?? 0) < 0.01) dragging.current = false;
  }

  function handleMomentumEnd(event: NativeSyntheticEvent<NativeScrollEvent>) {
    handleScrollSettled(event);
    dragging.current = false;
  }

  function jumpToNewest() {
    setUnread(0);
    follow(true);
    list.current?.scrollToEnd({ animated: true });
  }

  return (
    <View style={styles.wrap}>
      <FlatList
        ref={list}
        contentContainerStyle={[styles.content, { paddingBottom: styles.content.padding + LIVE_LIST_BOTTOM_PADDING }]}
        data={lines}
        extraData={{ translations, retryingTranslations, translationErrors }}
        keyExtractor={(line) => String(line.seq)}
        ListEmptyComponent={partial ? null : <Text style={styles.empty}>Hãy bắt đầu nói — chữ sẽ hiện ở đây.</Text>}
        ListFooterComponent={partial ? <Text style={styles.partial} testID="live-partial">{partial}</Text> : null}
        onContentSizeChange={handleContentSizeChange}
        onMomentumScrollEnd={handleMomentumEnd}
        onScrollBeginDrag={handleDragStart}
        onScrollEndDrag={handleDragEnd}
        renderItem={({ item }) => {
          const translation = translations?.[item.seq];
          return (
            <View style={styles.line}>
              {item.gapBeforeMs !== null ? <Text style={styles.gap}>{formatGapLabel(item.gapBeforeMs)}</Text> : null}
              <Text style={styles.timestamp}>{formatSegmentTimestamp(item.startedAtMs)}</Text>
              <Text style={styles.text}>{item.text}</Text>
              {translation ? (
                <TranslatedSegment
                  error={translationErrors?.[item.seq]}
                  failed={translation.status === 'failed' || Boolean(retryingTranslations?.has(item.seq))}
                  onRetry={onRetryTranslation ? () => onRetryTranslation(item.seq) : undefined}
                  retrying={retryingTranslations?.has(item.seq)}
                  text={translation.status === 'done' ? translation.text : null}
                />
              ) : null}
            </View>
          );
        }}
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
