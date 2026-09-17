import { useState } from 'react';
import { Link } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { useRegisterMutation } from '../../src/hooks/use-auth-mutations';
import { getErrorMessage } from '../../src/api/error-messages';
import { PrimaryButton } from '../../src/components/primary-button';
import { TextField } from '../../src/components/text-field';
import { colors } from '../../src/theme/colors';
import { typography } from '../../src/theme/typography';

export default function RegisterScreen() {
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const registerMutation = useRegisterMutation();

  const errorMessage = registerMutation.isError ? getErrorMessage(registerMutation.error) : null;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Đăng ký</Text>

      <TextField label="Họ tên hiển thị" onChangeText={setDisplayName} value={displayName} />
      <TextField
        autoCapitalize="none"
        keyboardType="email-address"
        label="Email"
        onChangeText={setEmail}
        value={email}
      />
      <TextField label="Mật khẩu" onChangeText={setPassword} secureTextEntry value={password} />

      {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}

      <PrimaryButton
        label="Đăng ký"
        loading={registerMutation.isPending}
        onPress={() =>
          registerMutation.mutate({ display_name: displayName, email, password })
        }
      />

      <Link href="/(auth)/login" style={styles.link}>
        Đã có tài khoản? Đăng nhập
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, gap: 16 },
  title: { ...typography.title, color: colors.text },
  error: { ...typography.caption, color: colors.danger },
  link: { ...typography.body, color: colors.primary, textAlign: 'center' },
});
