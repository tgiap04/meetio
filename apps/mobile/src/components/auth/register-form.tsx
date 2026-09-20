import { Pressable, StyleSheet, Text } from 'react-native';
import { AuthScreenShell } from './auth-screen-shell';
import { AuthDivider } from './auth-divider';
import { GoogleSignInButton } from './google-sign-in-button';
import { PrimaryButton } from '../primary-button';
import { TextField } from '../text-field';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';

/**
 * The full register screen body, twin of `LoginForm` (phase 06): purely
 * presentational, everything arrives through props. Phase 10 supplies the
 * hook and the navigation.
 *
 * ## Three fields, not two
 *
 * `RegisterRequest` needs a display name alongside email and password. The
 * server enforces the password rule (`@Length(8, 128)`); this component only
 * shows a static hint underneath the field — re-deriving that rule on the
 * client would be a second source of truth that can drift from the server's.
 *
 * ## Same Google button, same label, on both screens
 *
 * There is no "sign up with Google" vs. "sign in with Google" — the server
 * decides from the ID token alone whether to create, link, or sign in
 * (phase 03). Relabelling this button here would promise a different
 * behaviour than what actually happens, so the label stays
 * `"Tiếp tục với Google"`, identical to the login screen.
 *
 * Footer order matches phase 06's: primary action → divider → Google → the
 * cross-screen link LAST, so the two auth routes read as a matched pair
 * rather than splitting apart.
 *
 * Purely presentational: no router, no store, no query client, no native
 * module, no network call. Phase 10 wires behaviour.
 */
export interface RegisterFormProps {
  displayName: string;
  email: string;
  password: string;
  onChangeDisplayName: (value: string) => void;
  onChangeEmail: (value: string) => void;
  onChangePassword: (value: string) => void;
  onSubmit: () => void;
  submitting: boolean;
  errorMessage: string | null;
  onGooglePress: () => void;
  googlePending: boolean;
  googleErrorMessage: string | null;
  onNavigateToLogin: () => void;
}

export function RegisterForm({
  displayName,
  email,
  password,
  onChangeDisplayName,
  onChangeEmail,
  onChangePassword,
  onSubmit,
  submitting,
  errorMessage,
  onGooglePress,
  googlePending,
  googleErrorMessage,
  onNavigateToLogin,
}: RegisterFormProps) {
  return (
    <AuthScreenShell title="Đăng ký" subtitle="Tạo tài khoản để bắt đầu ghi âm cuộc họp của bạn.">
      <TextField
        label="Họ và tên"
        value={displayName}
        onChangeText={onChangeDisplayName}
        autoCapitalize="words"
        autoComplete="name"
        returnKeyType="next"
        testID="register-display-name-input"
      />

      <TextField
        label="Email"
        value={email}
        onChangeText={onChangeEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
        returnKeyType="next"
        testID="register-email-input"
      />

      <TextField
        label="Mật khẩu"
        value={password}
        onChangeText={onChangePassword}
        secureTextEntry
        // "new-password", never "current-password": this field creates a
        // credential, and that distinction is the signal password managers use
        // to *generate* a strong password instead of filling in an old one.
        autoComplete="new-password"
        returnKeyType="go"
        onSubmitEditing={onSubmit}
        testID="register-password-input"
      />
      <Text style={styles.hint}>Ít nhất 8 ký tự</Text>

      {errorMessage ? (
        <Text testID="register-error" style={styles.error}>
          {errorMessage}
        </Text>
      ) : null}

      <PrimaryButton
        label="Đăng ký"
        onPress={onSubmit}
        loading={submitting}
        disabled={googlePending}
        testID="register-submit-button"
      />

      <AuthDivider testID="register-divider" />

      <GoogleSignInButton
        onPress={onGooglePress}
        loading={googlePending}
        disabled={submitting}
        testID="register-google-button"
      />

      {googleErrorMessage ? (
        <Text testID="register-google-error" style={styles.error}>
          {googleErrorMessage}
        </Text>
      ) : null}

      <Pressable
        onPress={onNavigateToLogin}
        accessibilityRole="link"
        accessibilityLabel="Đã có tài khoản? Đăng nhập"
        style={styles.link}
        testID="register-login-link"
      >
        <Text style={styles.linkText}>
          Đã có tài khoản?{' '}
          <Text style={styles.linkTextStrong}>Đăng nhập</Text>
        </Text>
      </Pressable>
    </AuthScreenShell>
  );
}

const styles = StyleSheet.create({
  hint: { ...typography.caption, color: colors.textMuted, marginTop: -8 },
  error: { ...typography.caption, color: colors.danger },
  // 44pt+ touch target around the text, not just the glyph height.
  link: { minHeight: 44, justifyContent: 'center', alignItems: 'center' },
  linkText: { ...typography.body, color: colors.textMuted },
  // colors.primaryStrong (4.57:1 on the cream surface these screens use), never colors.primary (2.62:1) — see colors.ts.
  linkTextStrong: { color: colors.primaryStrong, fontWeight: '600' },
});
