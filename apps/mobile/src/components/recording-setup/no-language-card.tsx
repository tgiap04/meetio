import { Linking, StyleSheet, Text } from 'react-native';
import { SurfaceCard } from '../ui/surface-card';
import { SecondaryButton } from '../ui/secondary-button';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';

/**
 * US-12 + NFR-02: nothing to offer when the device cannot recognise any Meetio language offline.
 * Say why and how to fix it, instead of listing a language that would fail (or silently send
 * audio to a server) after the user presses Start.
 */
export function NoLanguageCard() {
  return (
    <SurfaceCard style={styles.card} testID="no-language-card">
      <Text style={styles.title}>Máy chưa nhận diện giọng nói offline được</Text>
      <Text style={styles.body}>
        Meetio chỉ nhận diện ngay trên điện thoại để âm thanh không rời khỏi máy. Hãy tải gói nhận diện tiếng Việt
        (hoặc tiếng Anh) để dùng offline: Android 13 trở lên — Cài đặt › Hệ thống › Ngôn ngữ › Nhận dạng giọng nói trên
        thiết bị; iPhone — Cài đặt › Cài đặt chung › Bàn phím, bật Đọc chính tả.
      </Text>
      <SecondaryButton label="Mở Cài đặt" onPress={() => void Linking.openSettings()} />
    </SurfaceCard>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12, padding: 16 },
  title: { ...typography.title, color: colors.text },
  body: { ...typography.body, color: colors.textMuted },
});
