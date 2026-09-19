import { useState } from 'react';
import { router } from 'expo-router';
import { LoginForm } from '../../src/components/auth/login-form';
import { useLoginMutation } from '../../src/hooks/use-auth-mutations';
import { useGoogleSignIn } from '../../src/hooks/use-google-sign-in';
import { getErrorMessage } from '../../src/api/error-messages';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const loginMutation = useLoginMutation();
  const google = useGoogleSignIn();

  return (
    <LoginForm
      email={email}
      password={password}
      onChangeEmail={setEmail}
      onChangePassword={setPassword}
      onSubmit={() => loginMutation.mutate({ email, password })}
      submitting={loginMutation.isPending}
      errorMessage={loginMutation.isError ? getErrorMessage(loginMutation.error) : null}
      onGooglePress={google.start}
      googlePending={google.isPending}
      googleErrorMessage={google.errorMessage}
      onNavigateToRegister={() => router.push('/(auth)/register')}
    />
  );
}
