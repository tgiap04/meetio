import { Redirect } from 'expo-router';
import { useSessionStore } from '../src/store/session.store';
import { usePreferencesStore } from '../src/store/preferences.store';
import { resolveBootstrapRoute } from '../src/navigation/bootstrap-route';

/**
 * The single decision point for where the app lands. Every screen that
 * finishes a step replaces to `'/'` and comes back here — see
 * `resolveBootstrapRoute` for the invariant this depends on.
 */
export default function IndexScreen() {
  const authStatus = useSessionStore((state) => state.authStatus);
  const onboardingCompleted = usePreferencesStore((state) => state.onboardingCompleted);
  const micPromptSeen = usePreferencesStore((state) => state.micPromptSeen);

  return <Redirect href={resolveBootstrapRoute({ authStatus, onboardingCompleted, micPromptSeen })} />;
}
