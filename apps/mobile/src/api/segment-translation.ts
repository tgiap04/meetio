import type { SegmentTranslation } from '@meetio/shared';
import { apiClient } from './axios-client';

/**
 * `POST /meetings/:id/segments/:seq/translate` — translates one segment again after an automatic
 * failure (Phase 09). Idempotent on the server: an already-translated segment just returns its text.
 */
export async function retrySegmentTranslation(meetingId: string, seq: number): Promise<SegmentTranslation> {
  const { data } = await apiClient.post<SegmentTranslation>(`/meetings/${meetingId}/segments/${seq}/translate`);
  if (data?.seq !== seq || typeof data.translated_text !== 'string' || typeof data.translated_to !== 'string') {
    throw new Error('Unexpected translation response');
  }
  return data;
}
