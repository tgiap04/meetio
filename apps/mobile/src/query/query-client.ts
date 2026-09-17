import { AppState, type AppStateStatus } from 'react-native';
import { QueryClient, focusManager, onlineManager } from '@tanstack/react-query';

/**
 * TanStack Query owns ALL server data — the cache, dedup, background refetch,
 * and invalidation. Nothing server-derived is allowed to also live in the
 * Zustand session store; see `src/store/session.store.ts` for that boundary.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

/**
 * Wires TanStack Query's `onlineManager` and `focusManager` to React Native's
 * `AppState`, per the plan's requirement to bind `onlineManager` to `AppState`
 * (no `NetInfo` dependency — out of scope for this phase, YAGNI until a real
 * connectivity signal is needed beyond foreground/background).
 *
 * Foregrounding the app is treated as "online" (a query is allowed to try);
 * backgrounding pauses refetch-on-focus so a backgrounded app does not spam
 * the API. Genuine network failures are still handled per-query via `retry`.
 */
function handleAppStateChange(status: AppStateStatus): void {
  const isForeground = status === 'active';
  focusManager.setFocused(isForeground);
  onlineManager.setOnline(isForeground);
}

export function wireQueryClientToAppState(): () => void {
  onlineManager.setOnline(AppState.currentState === 'active');
  const subscription = AppState.addEventListener('change', handleAppStateChange);
  return () => subscription.remove();
}
