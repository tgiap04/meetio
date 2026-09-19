import { ActivityIndicator, Image, Pressable, StyleSheet, Text } from 'react-native';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';

/**
 * The "Tiếp tục với Google" button — the *secondary* route into the app.
 *
 * ## Why it looks like this
 *
 * `design.png` has no auth screen, so the treatment is derived rather than
 * copied. Screen 4 ("Trang chủ") is the nearest reference: below its orange
 * primary CTA sit two secondary rows ("Nhập từ file âm thanh", "Kết nối thiết
 * bị khác") — white fill on the cream ground, one warm hairline border, an icon
 * at the left, plain slate label. That is already this design's vocabulary for
 * "an alternative action that must not shout", so this button adopts it whole.
 * Radius 8 rather than the home screen's softer rounding, so it matches the
 * `PrimaryButton` it stacks against.
 *
 * `minHeight: 48` does two jobs: it clears the 44pt touch-target floor, and it
 * stops the button collapsing when the label is swapped for the (shorter)
 * ActivityIndicator mid-flight.
 *
 * ## The G mark is the real one
 *
 * `assets/google-g.png` (+ @2x, @3x) is Google's own published asset, taken from
 * developers.google.com/static/identity/images/g-logo.png and rescaled onto a
 * square transparent canvas — which only adds the clear space Google's branding
 * guidelines ask for. It is a trademark: it is never redrawn, recoloured, or
 * approximated with Views.
 *
 * ## Purely presentational
 *
 * No hooks, no router, no network, no native module. It does not know what
 * Google is beyond the word. Phase 10 supplies `onPress`.
 */

/*
 * Metro resolves static image assets through `require()`, and this workspace
 * ships no `*.png` module declaration — an ESM `import` of the asset fails
 * `tsc --noEmit`. The rule is disabled for this one line rather than the file.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const GOOGLE_G = require('../../../assets/google-g.png');

const LABEL = 'Tiếp tục với Google';

export interface GoogleSignInButtonProps {
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  testID?: string;
}

export function GoogleSignInButton({
  onPress,
  loading = false,
  disabled = false,
  testID,
}: GoogleSignInButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      // Set explicitly rather than left to RN's composition from the child Text:
      // while `loading` the label is replaced by a spinner, and a button that
      // loses its accessible name mid-press is unusable with a screen reader.
      accessibilityLabel={LABEL}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.button,
        pressed && styles.buttonPressed,
        isDisabled && styles.buttonDisabled,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={colors.text} />
      ) : (
        <>
          <Image source={GOOGLE_G} style={styles.mark} resizeMode="contain" />
          <Text style={styles.label}>{LABEL}</Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    minHeight: 48,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  // Pressed reads as the cream screen ground showing through, so the feedback is
  // instant without giving the button any weight at rest.
  buttonPressed: { backgroundColor: colors.surface },
  buttonDisabled: { opacity: 0.5 },
  mark: { width: 20, height: 20 },
  // colors.text on colors.background is 13.7:1.
  label: { ...typography.button, color: colors.text },
});
