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
    <View style={styles.container}>
      <MicPermissionArt size={220} testID="permission-art" />
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
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 },
  title: { ...typography.heading, color: colors.text, textAlign: 'center' },
  body: { ...typography.body, color: colors.text, textAlign: 'center' },
  explain: { ...typography.caption, color: colors.textMuted, textAlign: 'center' },
  defer: { ...typography.button, color: colors.primaryStrong },
});
