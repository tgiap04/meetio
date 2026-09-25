import type { RegisterPushTokenRequest, UnregisterPushTokenRequest } from '@meetio/shared';
import { apiClient } from './axios-client';

/** `/users/me/push-tokens` calls per docs/api-spec.md §2 (US-30). */

export async function registerPushToken(body: RegisterPushTokenRequest): Promise<void> {
  await apiClient.post('/users/me/push-tokens', body);
}

export async function unregisterPushToken(body: UnregisterPushTokenRequest): Promise<void> {
  await apiClient.delete('/users/me/push-tokens', { data: body });
}
