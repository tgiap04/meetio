import { useCallback, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { SegmentTranslation } from '@meetio/shared';
import { retrySegmentTranslation } from '../api/segment-translation';
import { getErrorMessage } from '../api/error-messages';

export interface SegmentTranslationRetry {
  retry(seq: number): Promise<void>;
  /** Seqs with a retry in flight. */
  retrying: ReadonlySet<number>;
  /** Why the last retry of a seq failed (cleared by its next try). */
  errors: Readonly<Record<number, string>>;
}

/**
 * "Thử lại" for a segment whose translation failed (Phase 09) — shared by the live screen and the
 * transcript screen. Several segments may retry at once; one seq never twice. A success refreshes
 * the cached transcript and is reported to `onTranslated` (the live screen puts it in its store).
 */
export function useRetrySegmentTranslation(meetingId: string, onTranslated?: (translation: SegmentTranslation) => void): SegmentTranslationRetry {
  const queryClient = useQueryClient();
  const [retrying, setRetrying] = useState<ReadonlySet<number>>(new Set());
  const [errors, setErrors] = useState<Record<number, string>>({});
  const inFlight = useRef(new Set<number>());

  const retry = useCallback(
    async (seq: number) => {
      if (inFlight.current.has(seq)) return;
      inFlight.current.add(seq);
      setRetrying(new Set(inFlight.current));
      setErrors(({ [seq]: _cleared, ...rest }) => rest);
      try {
        const translation = await retrySegmentTranslation(meetingId, seq);
        onTranslated?.(translation);
        void queryClient.invalidateQueries({ queryKey: ['segments', meetingId] });
      } catch (error) {
        setErrors((current) => ({ ...current, [seq]: getErrorMessage(error) }));
      } finally {
        inFlight.current.delete(seq);
        setRetrying(new Set(inFlight.current));
      }
    },
    [meetingId, onTranslated, queryClient],
  );

  return { retry, retrying, errors };
}
