import { StyleSheet, Text } from 'react-native';
import { SurfaceCard } from '../ui/surface-card';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';

/**
 * Phase 18 + NFR-02: a phone that cannot recognise speech offline sends the audio to the Meetio
 * server to be turned into text. Say so on the setup screen, before the user presses Start —
 * the consent screen and the privacy policy carry the same statement.
 */
export const SERVER_MODE_NOTICE =
  'Máy này không nhận diện giọng nói offline được — âm thanh sẽ được gửi liên tục lên máy chủ Meetio và Google Gemini để chuyển thành chữ; máy chủ Meetio không lưu lại âm thanh. Meetio đang dùng gói miễn phí của Gemini — Google có thể dùng nội dung này để cải thiện sản phẩm.';

export function ServerModeNotice() {
  return (
    <SurfaceCard style={styles.card} testID="server-mode-notice">
      <Text style={styles.body}>{SERVER_MODE_NOTICE}</Text>
    </SurfaceCard>
  );
}

const styles = StyleSheet.create({
  card: { padding: 16 },
  body: { ...typography.body, color: colors.text },
});
