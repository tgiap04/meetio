import { ApiErrorCode } from '@meetio/shared';
import type { SqlDb } from './queue-db';
import type { LocalMeeting } from './local-meetings';
import { apiErrorCode, httpStatus } from './sync-errors';
import { TRANSLATION_MAX_NOT_FOUND, type SyncApi } from './sync-types';
import { bumpTranslationAttempts, dropTranslation, removeTranslation, syncableTranslations } from './translation-queue';

/**
 * PUTs the on-device translations of segments the server already holds (Phase 21).
 * 400: refused for good, dropped. 404: the segment is not there yet — throws so the pass retries
 * with backoff, up to a cap so a permanent 404 cannot strand `end`. Anything else (offline, 5xx)
 * propagates to the pass, which classifies it.
 */
export async function syncTranslations(db: SqlDb, api: SyncApi, m: LocalMeeting): Promise<void> {
  let waiting = false;
  for (const t of await syncableTranslations(db, m.id, Number.MAX_SAFE_INTEGER)) {
    try {
      await api.putSegmentTranslation(m.ownerId, m.id, t.seq, { translated_text: t.text, translated_to: t.translatedTo as 'vi-VN' | 'en-US' });
      await removeTranslation(db, m.id, t.seq, t.text);
    } catch (error) {
      const status = httpStatus(error);
      if (status === 400) await dropTranslation(db, m.id, t.seq);
      else if (status === 404 && apiErrorCode(error) !== ApiErrorCode.MEETING_NOT_FOUND) {
        if ((await bumpTranslationAttempts(db, m.id, t.seq)) >= TRANSLATION_MAX_NOT_FOUND) await dropTranslation(db, m.id, t.seq);
        else waiting = true;
      } else throw error;
    }
  }
  if (waiting) throw new Error('translations waiting for their segments');
}
