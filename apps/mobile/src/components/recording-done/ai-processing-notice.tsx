import { StyleSheet, Text, View } from 'react-native';
import { AppIcon } from '../icons/app-icon';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';

const HEADING = 'Đang xử lý bằng AI';

// LOW CONFIDENCE: the crop's body copy is rendered at low resolution in
// design/screen-07-sau-khi-ghi-am.png. The wording below is the most
// legible reading of the two lines and is transcribed as closely to the
// source as the crop allows.
const BODY_LINE_1 =
  'Chúng tôi đang phân tích nội dung cuộc họp để tạo bản tóm tắt, action items và đồ thị tri thức.';
/**
 * Prototype-honesty note: this line promises a notification
 * ("chúng tôi sẽ thông báo khi hoàn tất") that this screen never sends —
 * nothing in this app polls the pipeline or pushes a notification when it
 * finishes; the four rows below are a static snapshot. Harmless copy in a
 * prototype; it would be a real consent problem if shipped to a user without
 * the notification actually being built.
 */
const BODY_LINE_2 = 'Bạn có thể rời đi, chúng tôi sẽ thông báo khi hoàn tất.';

/** Peach notice card announcing the AI pipeline has started — screen-07. */
export function AiProcessingNotice() {
  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.iconWell}>
          <AppIcon color={colors.background} name="sparkle" size={16} />
        </View>
        <Text style={styles.heading}>{HEADING}</Text>
      </View>
      <Text style={styles.body}>
        {BODY_LINE_1}
        {'\n'}
        {BODY_LINE_2}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.primaryTint, borderRadius: 16, padding: 16, gap: 8 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconWell: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heading: { ...typography.label, color: colors.primaryStrong },
  body: { ...typography.caption, color: colors.textMuted, lineHeight: 18 },
});
