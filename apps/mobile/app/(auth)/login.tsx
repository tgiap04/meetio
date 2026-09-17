import { useState } from 'react';
import { Link } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { useLoginMutation } from '../../src/hooks/use-auth-mutations';
import { getErrorMessage } from '../../src/api/error-messages';
import { DevResetButton } from '../../src/components/dev/dev-reset-button';
import { PrimaryButton } from '../../src/components/primary-button';
import { TextField } from '../../src/components/text-field';
import { colors } from '../../src/theme/colors';
import { typography } from '../../src/theme/typography';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const loginMutation = useLoginMutation();

  const errorMessage = loginMutation.isError ? getErrorMessage(loginMutation.error) : null;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Đăng nhập</Text>

      <TextField
        autoCapitalize="none"
        keyboardType="email-address"
        label="Email"
        onChangeText={setEmail}
        value={email}
      />
      <TextField
        label="Mật khẩu"
        onChangeText={setPassword}
        secureTextEntry
        value={password}
      />

      {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}

      <PrimaryButton
        label="Đăng nhập"
        loading={loginMutation.isPending}
        onPress={() => loginMutation.mutate({ email, password })}
      />

      <Link href="/(auth)/register" style={styles.link}>
        Chưa có tài khoản? Đăng ký
      </Link>

      <DevResetButton />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, gap: 16 },
  title: { ...typography.title, color: colors.text },
  error: { ...typography.caption, color: colors.danger },
  link: { ...typography.body, color: colors.primary, textAlign: 'center' },
});
