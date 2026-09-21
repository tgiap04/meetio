import { useEffect } from 'react';
import { Slot } from 'expo-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { queryClient, wireQueryClientToAppState } from '../src/query/query-client';
import { useHydrateSession } from '../src/hooks/use-hydrate-session';
import { useHydratePreferences } from '../src/hooks/use-hydrate-preferences';
import { useMinimumSplashDelay } from '../src/hooks/use-minimum-splash-delay';
import { useSessionStore } from '../src/store/session.store';
import { usePreferencesStore } from '../src/store/preferences.store';
import { AppSplash } from '../src/components/splash/app-splash';

/**
 * Root layout. Wires the TanStack Query provider and holds the app on the
 * splash (design screen 1) until all three boot-gate conditions clear —
 * session hydrated, preferences hydrated, and a 900ms floor so the splash
 * reads as a moment rather than a flicker (decisions.md §1). Only then does
 * `<Slot/>` mount, so no child route gets the chance to fire a redirect and
 * be yanked back.
 */
export default function RootLayout() {
  useHydrateSession();
  useHydratePreferences();
  const authStatus = useSessionStore((state) => state.authStatus);
  const preferencesStatus = usePreferencesStore((state) => state.status);
  const minimumElapsed = useMinimumSplashDelay(900);

  useEffect(() => wireQueryClientToAppState(), []);

  const isBooting = authStatus === 'hydrating' || preferencesStatus !== 'ready' || !minimumElapsed;

  // SafeAreaProvider wraps the splash too, not just `<Slot/>`: it is the only
  // source of inset values in the tree, and a screen that mounts before it
  // would read zeros and draw its header under the status bar / Dynamic Island.
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        {isBooting ? <AppSplash /> : <Slot />}
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
