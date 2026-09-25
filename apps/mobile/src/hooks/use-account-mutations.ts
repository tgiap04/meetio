import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { DeleteMeRequest, UpdateMeRequest } from '@meetio/shared';
import { deleteMe, recordConsent, updateMe } from '../api/users';
import { clearTokens } from '../storage/secure-store';
import { useSessionStore } from '../store/session.store';
import { unregisterCurrentPushToken } from '../notifications/push-registration';
import { ME_QUERY_KEY } from './use-me-query';

export function useUpdateMeMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateMeRequest) => updateMe(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY }),
  });
}

export function useRecordConsentMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => recordConsent(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY }),
  });
}

export function useDeleteAccountMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: DeleteMeRequest) => {
      // Same ordering requirement as `useLogoutMutation`: unregister the push
      // token while the access token this DELETE needs is still valid, ahead
      // of `deleteMe` (which the server treats as the end of the session).
      await unregisterCurrentPushToken();
      return deleteMe(body);
    },
    onSuccess: async () => {
      await clearTokens();
      useSessionStore.getState().clearTokens();
      queryClient.clear();
    },
  });
}
