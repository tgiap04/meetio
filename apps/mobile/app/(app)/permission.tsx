import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { ScreenBackdrop } from '../../src/components/illustrations/screen-backdrop';
import { PermissionBody, type AskOrBlockedView } from '../../src/components/permission/permission-body';
import { useMicrophonePermission } from '../../src/hooks/use-microphone-permission';
import { colors } from '../../src/theme/colors';

/**
 * Screen 3 of the design — reached only by redirect from `app/index.tsx`
 * once the user is authenticated and `mic_prompt_seen` is still false (see
 * `bootstrap-route.ts`). There is no navigation history to pop back into, so
 * the back chevron intentionally shares its handler with "Không, để sau"
 * rather than calling `router.back()` into a dead end (decisions.md §4).
 */
export default function PermissionScreen() {
  const { view, isBusy, onPrimaryPress, onDefer } = useMicrophonePermission();
  const { width } = useWindowDimensions();

  return (
    <View style={styles.screen}>
      <ScreenBackdrop width={width} testID="permission-backdrop" />
      <Text
        testID="permission-back-button"
        accessibilityRole="button"
        accessibilityLabel="Bỏ qua, để sau"
        style={styles.back}
        onPress={onDefer}
      >
        ‹
      </Text>
      <PermissionBody
        view={view as AskOrBlockedView}
        isBusy={isBusy}
        onPrimaryPress={onPrimaryPress}
        onDefer={onDefer}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  back: { fontSize: 28, color: colors.text, padding: 16 },
});
