import { StyleSheet, Text, View } from 'react-native';
import { BrandedParagraph } from '../branded-paragraph';
import { MicPermissionArt } from '../illustrations/mic-permission-art';
import { PrimaryButton } from '../primary-button';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import type { AskOrBlockedView } from '../../permissions/microphone-permission';

export type { AskOrBlockedView };

/**
 * Purely presentational body for the microphone-permission screen
 * (`app/(app)/permission.tsx`). Knows nothing about `expo-audio`,
 * `expo-linking`, routing, or the preferences store — it only renders one of
 * two views and forwards taps to the two handlers it is given. See
 * decisions.md §4 for why `blocked` exists at all (iOS's "ask once" dialog).
 */
export interface PermissionBodyProps {
  view: AskOrBlockedView;
  isBusy: boolean;
  onPrimaryPress: () => void;
  onDefer: () => void;
}

const PRIMARY_LABEL: Record<AskOrBlockedView, string> = {
  ask: 'Cho phép',
  blocked: 'Mở Cài đặt',
};

export function PermissionBody({ view, isBusy, onPrimaryPress, onDefer }: PermissionBodyProps) {
  return (
    <View testID="permission-body" style={styles.container}>
      <View style={styles.art}>
        <MicPermissionArt size={220} testID="permission-art" />
      </View>
      <Text style={styles.title}>{'Cần quyền truy cập\nMicrophone'}</Text>
      <BrandedParagraph
        text="Meetio cần quyền truy cập microphone để có thể ghi âm và nhận diện giọng nói."
        style={styles.body}
      />
      {view === 'blocked' ? (
        <Text testID="permission-blocked-explain" style={styles.explain}>
          Bạn đã từ chối quyền microphone. Mở Cài đặt hệ thống để bật lại trước khi ghi âm.
        </Text>
      ) : null}
      <PrimaryButton
        testID="permission-primary-button"
        label={PRIMARY_LABEL[view]}
        loading={isBusy}
        onPress={onPrimaryPress}
      />
      <Text
        testID="permission-defer-link"
        accessibilityRole="button"
        style={styles.defer}
        onPress={onDefer}
      >
        Không, để sau
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // KHÔNG đặt `alignItems: 'center'` ở đây. Nó ép MỌI đứa con co lại bằng bề
  // rộng nội dung, kể cả nút "Cho phép" — trong khi design vẽ nút trải hết bề
  // ngang trong lề 24pt. Căn giữa là việc của từng con: chữ dùng `textAlign`,
  // hình dùng `art`. (Onboarding/các màn auth không dính vì chúng căn bằng
  // `paddingHorizontal` và `AuthScreenShell`, không bằng `alignItems`.)
  container: { flex: 1, justifyContent: 'center', padding: 24, gap: 16 },
  art: { alignItems: 'center' },
  title: { ...typography.heading, color: colors.text, textAlign: 'center' },
  body: { ...typography.body, color: colors.text, textAlign: 'center' },
  explain: { ...typography.caption, color: colors.textMuted, textAlign: 'center' },
  // Xám câm theo design, không phải cam. Mất màu thì không được mất luôn vùng
  // chạm: `lineHeight` nong hộp dòng lên 44pt (sàn của iOS/Android) và canh
  // giữa chữ trong đó; `minHeight` giữ sàn ấy kể cả khi ai đó bỏ `lineHeight`.
  // `alignSelf` để link chỉ rộng bằng chữ: container đã stretch, không thì vùng
  // chạm trải hết bề ngang ngay dưới nút chính và tay trượt khỏi nút sẽ bấm
  // nhầm vào "để sau".
  defer: {
    ...typography.button,
    color: colors.textMuted,
    alignSelf: 'center',
    minHeight: 44,
    lineHeight: 44,
  },
});
