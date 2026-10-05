import type { PutSegmentTranslationRequest } from '@meetio/shared';
import { apiClient } from './axios-client';

/**
 * `PUT /meetings/:id/segments/:seq/translation` — stores the phone's on-device translation with the
 * segment (204, idempotent). 404: the segment is not on the server yet (or not yours) — retry later;
 * 400: the language does not match the meeting's `translate_to`, or translation is off.
 * `ownerId`: when given, the request is refused if another user is signed in (queued data).
 */
export async function putSegmentTranslation(
  ownerId: string | undefined,
  meetingId: string,
  seq: number,
  body: PutSegmentTranslationRequest,
): Promise<void> {
  await apiClient.put(`/meetings/${meetingId}/segments/${seq}/translation`, body, { expectedOwnerId: ownerId });
}
