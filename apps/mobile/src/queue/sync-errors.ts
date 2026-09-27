import { isAxiosError } from 'axios';
import { ApiErrorCode, type ApiErrorEnvelope } from '@meetio/shared';
import { OwnerMismatchError } from '../api/axios-client';

/**
 * How the sync worker reacts to a failed call:
 * - `offline`: no response at all — stop this pass, retry with backoff, show "mất kết nối".
 * - `gone`: the meeting was deleted on the server — nothing left to sync it into.
 * - `blocked`: the server refuses it until the user acts (consent) — stop retrying it.
 * - `stale`: the request was refused on the device because a different user is now signed in.
 * - `retry`: anything else (5xx, 429, a refresh in flight) — try again later.
 */
export type SyncFailure = { kind: 'stale' } | { kind: 'offline' } | { kind: 'gone' } | { kind: 'blocked'; code: string } | { kind: 'retry' };

export function classifySyncError(error: unknown): SyncFailure {
  if (error instanceof OwnerMismatchError) return { kind: 'stale' };
  if (!isAxiosError<ApiErrorEnvelope>(error)) return { kind: 'retry' };
  if (!error.response) return { kind: 'offline' };
  const code = error.response.data?.error?.code;
  if (code === ApiErrorCode.MEETING_NOT_FOUND) return { kind: 'gone' };
  if (code === ApiErrorCode.CONSENT_REQUIRED) return { kind: 'blocked', code };
  return { kind: 'retry' };
}

export function apiErrorCode(error: unknown): string | undefined {
  return isAxiosError<ApiErrorEnvelope>(error) ? error.response?.data?.error?.code : undefined;
}
