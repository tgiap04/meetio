import { useState } from 'react';
import { router } from 'expo-router';
import { RegisterForm } from '../../src/components/auth/register-form';
import { useRegisterMutation } from '../../src/hooks/use-auth-mutations';
import { useGoogleSignIn } from '../../src/hooks/use-google-sign-in';
import { getErrorMessage } from '../../src/api/error-messages';

export default function RegisterScreen() {
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const registerMutation = useRegisterMutation();
  const google = useGoogleSignIn();

  return (
    <RegisterForm
      displayName={displayName}
      email={email}
      password={password}
      onChangeDisplayName={setDisplayName}
      onChangeEmail={setEmail}
      onChangePassword={setPassword}
      onSubmit={() => registerMutation.mutate({ display_name: displayName, email, password })}
      submitting={registerMutation.isPending}
      errorMessage={registerMutation.isError ? getErrorMessage(registerMutation.error) : null}
      onGooglePress={google.start}
      googlePending={google.isPending}
      googleErrorMessage={google.errorMessage}
      onNavigateToLogin={() => router.push('/(auth)/login')}
    />
  );
}
