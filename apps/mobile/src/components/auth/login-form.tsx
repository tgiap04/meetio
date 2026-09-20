import { Pressable, StyleSheet, Text } from 'react-native';
import { AuthScreenShell } from './auth-screen-shell';
import { AuthDivider } from './auth-divider';
import { GoogleSignInButton } from './google-sign-in-button';
import { DevResetButton } from '../dev/dev-reset-button';
import { PrimaryButton } from '../primary-button';
import { TextField } from '../text-field';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';

/**
 * The full login screen body: purely presentational, everything arrives
 * through props. Phase 10 supplies the hook and the navigation.
 *
 * ## Two lines of error, not one
 *
 * The email/password error and the Google error are rendered separately,
 * each under its own action. Merging them into one line would mean "Email
 * hoặc mật khẩu không đúng" can appear after pressing the *Google* button,
 * which is meaningless — the two are independent failure surfaces.
 *
 * ## Cross-locking, not cross-hiding
 *
 * `submitting` disables the Google button and `googlePending` disables the
 * primary button, rather than either flow hiding the other's control. Two
 * concurrent sign-in attempts would race two `persistSession` writes.
 *
 * ## The contrast debt gets paid here
 *
 * The old screen used `colors.primary` for the *entire* footer link — 2.62:1
 * on the light ground, effectively unreadable at body size (see `colors.ts`).
 * Only the action word ("Đăng ký") gets `colors.primaryStrong` (4.57:1 on cream); the
 * question text stays `colors.textMuted`, because it is not itself a tap
 * target and painting the whole line orange would flatten the one thing that
 * actually matters. Same split as `RegisterForm`'s footer, so the two auth
 * screens read as a matched pair rather than diverging in color, weight, and
 * alignment.
 *
 * ## `DevResetButton` stays
 *
 * It is the only way back to onboarding on iOS once the Keychain-backed
 * flags are set (`usePreferencesStore` survives an app delete). Dropping it
 * from this rebuild would remove that escape hatch.
 *
 * ## No client-side email validation
 *
 * The server already returns `VALIDATION_ERROR` with per-field `details`,
 * translated by `getErrorMessage`. A second rule set here would just be a
 * second source of truth that can drift from the server's (YAGNI).
 *
 * Purely presentational: no router, no store, no query client, no native
 * module, no network call. `DevResetButton` is the one permitted exception —
 * it gates itself on `__DEV__` internally (phase 05/06 contract).
 */
export interface LoginFormProps {
  email: string;
  password: string;
  onChangeEmail: (value: string) => void;
  onChangePassword: (value: string) => void;
  onSubmit: () => void;
  submitting: boolean;
  errorMessage: string | null;
  onGooglePress: () => void;
  googlePending: boolean;
  googleErrorMessage: string | null;
  onNavigateToRegister: () => void;
}

export function LoginForm({
  email,
  password,
  onChangeEmail,
  onChangePassword,
  onSubmit,
  submitting,
  errorMessage,
  onGooglePress,
  googlePending,
  googleErrorMessage,
  onNavigateToRegister,
}: LoginFormProps) {
  return (
    <AuthScreenShell title="Đăng nhập">
      <TextField
        label="Email"
        value={email}
        onChangeText={onChangeEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
        returnKeyType="next"
        testID="login-email-input"
      />

      <TextField
        label="Mật khẩu"
        value={password}
        onChangeText={onChangePassword}
        secureTextEntry
        autoComplete="current-password"
        returnKeyType="go"
        onSubmitEditing={onSubmit}
        testID="login-password-input"
      />

      {errorMessage ? (
        <Text testID="login-error" style={styles.error}>
          {errorMessage}
        </Text>
      ) : null}

      <PrimaryButton
        label="Đăng nhập"
        onPress={onSubmit}
        loading={submitting}
        disabled={googlePending}
        testID="login-submit-button"
      />

      <AuthDivider testID="login-divider" />

      <GoogleSignInButton
        onPress={onGooglePress}
        loading={googlePending}
        disabled={submitting}
        testID="login-google-button"
      />

      {googleErrorMessage ? (
        <Text testID="login-google-error" style={styles.error}>
          {googleErrorMessage}
        </Text>
      ) : null}

      <Pressable
        onPress={onNavigateToRegister}
        accessibilityRole="link"
        accessibilityLabel="Chưa có tài khoản? Đăng ký"
        style={styles.link}
        testID="login-register-link"
      >
        <Text testID="login-register-link-label" style={styles.linkText}>
          Chưa có tài khoản?{' '}
          <Text testID="login-register-link-label-strong" style={styles.linkTextStrong}>
            Đăng ký
          </Text>
        </Text>
      </Pressable>

      <DevResetButton />
    </AuthScreenShell>
  );
}

const styles = StyleSheet.create({
  error: { ...typography.caption, color: colors.danger },
  // 44pt+ touch target around the text, not just the glyph height.
  link: { minHeight: 44, justifyContent: 'center', alignItems: 'center' },
  linkText: { ...typography.body, color: colors.textMuted },
  // colors.primaryStrong (4.57:1 on the cream surface these screens use), never colors.primary (2.62:1) — see
  // colors.ts. Only the action word carries it: the question text is not itself
  // a tap target, so painting the whole line orange would flatten that.
  linkTextStrong: { color: colors.primaryStrong, fontWeight: '600' },
});
