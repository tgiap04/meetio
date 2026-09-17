import type {
  DeleteMeRequest,
  GetMeResponse,
  RecordConsentRequest,
  RecordConsentResponse,
  UpdateMeRequest,
  UpdateMeResponse,
} from '@meetio/shared';
import { apiClient } from './axios-client';

/**
 * `/users/me*` calls per docs/api-spec.md §2. Types come straight from
 * `@meetio/shared`.
 */

export async function getMe(): Promise<GetMeResponse> {
  const { data } = await apiClient.get<GetMeResponse>('/users/me');
  return data;
}

export async function updateMe(body: UpdateMeRequest): Promise<UpdateMeResponse> {
  const { data } = await apiClient.patch<UpdateMeResponse>('/users/me', body);
  return data;
}

export async function recordConsent(
  body: RecordConsentRequest = {},
): Promise<RecordConsentResponse> {
  const { data } = await apiClient.post<RecordConsentResponse>('/users/me/consent', body);
  return data;
}

export async function deleteMe(body: DeleteMeRequest): Promise<void> {
  await apiClient.delete('/users/me', { data: body });
}
