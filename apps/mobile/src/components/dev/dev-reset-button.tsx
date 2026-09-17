import { router } from 'expo-router';
import { Alert, Pressable, StyleSheet, Text } from 'react-native';
import { usePreferencesStore } from '../../store/preferences.store';
import { ROOT_ROUTE } from '../../navigation/route-guards';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';

/**
 * Development-only escape hatch back to the start of the flow.
 *
 * Once onboarding is completed the flags persist in `expo-secure-store`, and on
 * iOS that is the Keychain, which survives deleting the app — so without this
 * there is genuinely no way to see the onboarding or microphone-permission
 * screens again short of erasing the whole simulator.
 *
 * Mounted on login and on settings: those are the two screens reachable once
 * the flow is finished, signed out and signed in respectively.
 *
 * `__DEV__` is a compile-time constant that Metro substitutes and dead-code
 * eliminates, so this control cannot reach a release build. The check sits
 * above every hook call on purpose — the component deliberately has none, and
 * reads the action off `getState()` instead, so the early return can never
 * change hook order.
 */
export function DevResetButton() {
  if (!__DEV__) {
    return null;
  }

  return (
    <Pressable
      accessibilityRole="button"
      onPress={resetToOnboarding}
      style={styles.button}
      testID="dev-reset-button"
    >
      <Text style={styles.label}>Đặt lại onboarding (DEV)</Text>
    </Pressable>
  );
}

function resetToOnboarding() {
  // Navigate on the synchronous state flip rather than on the delete: routing
  // reads the store, so the app is already correct here. The delete only
  // decides whether the reset survives a relaunch, which is what the alert
  // below reports — a swallowed failure would look identical until next boot.
  const cleared = usePreferencesStore.getState().reset();
  router.replace(ROOT_ROUTE);

  cleared.catch(() => {
    Alert.alert(
      'Đặt lại chưa được lưu',
      'Onboarding hiện lại trong phiên này, nhưng xóa Keychain thất bại nên mở lại app sẽ bỏ qua onboarding.',
    );
  });
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    borderStyle: 'dashed',
  },
  label: { ...typography.caption, color: colors.textMuted },
});
