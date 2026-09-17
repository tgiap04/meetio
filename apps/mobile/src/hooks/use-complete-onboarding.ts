import { router } from 'expo-router';
import { usePreferencesStore } from '../store/preferences.store';
import { ROOT_ROUTE } from '../navigation/route-guards';

/**
 * Shared by both onboarding completion paths ("Bắt đầu" on page 3, and
 * "Bỏ qua" from any page). Order is load-bearing (decisions.md §2/§3): the
 * store flag must flip BEFORE navigating, or `app/index.tsx` reads the stale
 * flag and bounces straight back to `/onboarding`.
 */
export function useCompleteOnboarding(): () => void {
  const markOnboardingCompleted = usePreferencesStore((state) => state.markOnboardingCompleted);

  return () => {
    markOnboardingCompleted();
    router.replace(ROOT_ROUTE);
  };
}
