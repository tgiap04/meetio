import { useEffect } from 'react';
import { Slot } from 'expo-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient, wireQueryClientToAppState } from '../src/query/query-client';
import { useHydrateSession } from '../src/hooks/use-hydrate-session';
import { useSessionStore } from '../src/store/session.store';
import { LoadingState } from '../src/components/loading-state';

/**
 * Root layout. Wires the TanStack Query provider for the whole app and holds
 * the app on a loading screen until the session has finished hydrating from
 * secure storage (US-02) — routing decisions in `(auth)`/`(app)` group layouts
 * assume `authStatus` is no longer `'hydrating'` by the time they run.
 */
export default function RootLayout() {
  useHydrateSession();
  const authStatus = useSessionStore((state) => state.authStatus);

  useEffect(() => wireQueryClientToAppState(), []);

  return (
    <QueryClientProvider client={queryClient}>
      {authStatus === 'hydrating' ? <LoadingState label="Đang khởi động…" /> : <Slot />}
    </QueryClientProvider>
  );
}
