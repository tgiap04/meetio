import { StyleSheet, Text, View } from 'react-native';
import { AppIcon } from '../icons/app-icon';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';

/** Verbatim from `design/screen-07-sau-khi-ghi-am.png`. */
const TITLE = 'Đã ghi âm xong!';
const DURATION = '42 phút 18 giây';
const WORD_COUNT = '1.284 từ đã được ghi nhận';

/**
 * Hero block at the top of the post-recording screen: a haloed check circle
 * plus the confirmation title, duration and word count.
 *
 * The halo is a larger `primaryTint` circle behind a solid `primary` circle —
 * the same two-circle technique screen 06's pause button uses. Built as a
 * local, private implementation rather than a shared import: P05 (screen 06)
 * and P06 (this screen) run in parallel and neither owns the other's files,
 * so each builds its own copy. If this shape is needed a third time, P13
 * promotes it into `src/components/ui/` after all screen phases land.
 */
export function RecordingDoneHero() {
  return (
    <View style={styles.container}>
      <View style={styles.halo}>
        <View style={styles.circle}>
          <AppIcon color={colors.background} name="check" size={36} />
        </View>
      </View>
      <Text style={styles.title}>{TITLE}</Text>
      <Text style={styles.duration}>{DURATION}</Text>
      <Text style={styles.wordCount}>{WORD_COUNT}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', gap: 6, paddingVertical: 8 },
  halo: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: colors.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  circle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { ...typography.heading, color: colors.text },
  duration: { ...typography.body, color: colors.textMuted },
  wordCount: { ...typography.caption, color: colors.textMuted },
});
