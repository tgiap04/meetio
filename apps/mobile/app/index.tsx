import { Redirect } from 'expo-router';
import { APP_HOME_ROUTE } from '../src/navigation/route-guards';

/**
 * Entry route. Always points at `(app)` — the `(app)` group layout is the
 * single place that decides whether that is actually reachable, bouncing to
 * `(auth)/login` when the session is not authenticated.
 */
export default function IndexScreen() {
  return <Redirect href={APP_HOME_ROUTE} />;
}
