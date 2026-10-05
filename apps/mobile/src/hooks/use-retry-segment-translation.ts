import { useCallback, useRef, useState } from 'react';
import { isAxiosError } from 'axios';
import { getErrorMessage } from '../api/error-messages';
import { TranslationUnavailableError } from '../../modules/mlkit-translate';

export interface SegmentTranslationRetry {
  retry(seq: number): Promise<void>;
  /** Seqs with a retry in flight. */
  retrying: ReadonlySet<number>;
  /** Why the last retry of a seq failed (cleared by its next try). */
  errors: Readonly<Record<number, string>>;
}

export const TRANSLATE_FAILED_MESSAGE = 'Chưa dịch được trên máy. Kiểm tra gói dịch trong Cài đặt ghi âm rồi thử lại.';

function retryErrorMessage(error: unknown): string {
  if (isAxiosError(error)) return getErrorMessage(error); // storing the translation failed
  if (error instanceof TranslationUnavailableError) return error.message;
  return TRANSLATE_FAILED_MESSAGE;
}

/**
 * "Thử lại" / "Dịch" for a segment with no translation — shared by the live screen and the transcript
 * screen (Phase 21: both translate on the device). `run` does the work for one seq and rejects on
 * failure. Several segments may run at once; one seq never twice.
 */
export function useRetrySegmentTranslation(run: (seq: number) => Promise<void>): SegmentTranslationRetry {
  const [retrying, setRetrying] = useState<ReadonlySet<number>>(new Set());
  const [errors, setErrors] = useState<Record<number, string>>({});
  const inFlight = useRef(new Set<number>());
  const latestRun = useRef(run);
  latestRun.current = run;

  const retry = useCallback(async (seq: number) => {
    if (inFlight.current.has(seq)) return;
    inFlight.current.add(seq);
    setRetrying(new Set(inFlight.current));
    setErrors(({ [seq]: _cleared, ...rest }) => rest);
    try {
      await latestRun.current(seq);
    } catch (error) {
      setErrors((current) => ({ ...current, [seq]: retryErrorMessage(error) }));
    } finally {
      inFlight.current.delete(seq);
      setRetrying(new Set(inFlight.current));
    }
  }, []);

  return { retry, retrying, errors };
}
