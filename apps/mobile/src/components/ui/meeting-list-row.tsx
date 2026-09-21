import { Pressable, StyleSheet, Text, View } from 'react-native';
import { InitialsAvatar } from './initials-avatar';
import { StatusBadge, type StatusBadgeStatus } from './status-badge';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';

/** Mini orange equalizer bars — the "waveform" leading glyph on screens 09/12/13. */
function WaveformGlyph() {
  const heights = [8, 16, 22, 14, 9];
  return (
    <View style={styles.waveformWell}>
      <View style={styles.waveformBars}>
        {heights.map((height, index) => (
          <View key={index} style={[styles.waveformBar, { height }]} />
        ))}
      </View>
    </View>
  );
}

export interface MeetingListRowProps {
  leading: 'avatar' | 'waveform';
  /** Required when `leading` is `"avatar"`. */
  avatarInitials?: string;
  title: string;
  meta: string;
  badge?: { status: StatusBadgeStatus; label?: string };
  /** Optional matched-text preview — screen-13 search results. */
  snippet?: string;
  onPress?: () => void;
}

/** One meeting row — home recent list, library list, search results. */
export function MeetingListRow({ leading, avatarInitials, title, meta, badge, snippet, onPress }: MeetingListRowProps) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.row}>
      {leading === 'avatar' ? <InitialsAvatar initials={avatarInitials ?? '?'} /> : <WaveformGlyph />}
      <View style={styles.textColumn}>
        <Text numberOfLines={1} style={styles.title}>
          {title}
        </Text>
        <Text numberOfLines={1} style={styles.meta}>
          {meta}
        </Text>
        {snippet ? (
          <Text numberOfLines={1} style={styles.snippet}>
            {snippet}
          </Text>
        ) : null}
      </View>
      {badge ? <StatusBadge label={badge.label} status={badge.status} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  textColumn: { flex: 1, gap: 2 },
  title: { ...typography.label, color: colors.text },
  meta: { ...typography.caption, color: colors.textMuted },
  snippet: { ...typography.caption, color: colors.textMuted, fontStyle: 'italic' },
  waveformWell: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  waveformBars: { flexDirection: 'row', alignItems: 'center', gap: 2, height: 22 },
  waveformBar: { width: 2, borderRadius: 1, backgroundColor: colors.primary },
});
