import { useCallback, useEffect, useRef, useState } from 'react';
import { downloadModel, isModelDownloaded, isTranslationAvailable, type TranslationLanguage } from '../../modules/mlkit-translate';

/**
 * - `off`: no translation chosen — nothing to prepare.
 * - `checking` / `downloading`: working (ML Kit reports no byte progress, so both are indeterminate).
 * - `missing`: a language pack is not on the phone yet — the user chooses when to download (~30 MB each).
 * - `ready`: both packs are on the phone; recording with translation may start.
 * - `unavailable`: this build has no on-device translation (no native module).
 * - `error`: a check or download failed; `download()` / `recheck()` try again.
 */
export type TranslationPackStatus = 'off' | 'checking' | 'missing' | 'downloading' | 'ready' | 'unavailable' | 'error';

export interface TranslationPacks {
  status: TranslationPackStatus;
  /** Why the last check or download failed. */
  error: string | null;
  /** Downloads whatever is missing (any network), then re-checks. */
  download(): void;
  recheck(): void;
}

const isSupported = (tag: string | null): tag is TranslationLanguage => tag === 'vi-VN' || tag === 'en-US';

/** A pack download that has not finished by now is treated as failed (stuck network), so the user can retry. */
export const DOWNLOAD_TIMEOUT_MS = 5 * 60_000;
export const PACK_CHECK_FAILED = 'Không kiểm tra được gói dịch. Thử lại.';
export const PACK_DOWNLOAD_FAILED = 'Không tải được gói dịch. Kiểm tra mạng rồi thử lại.';

/**
 * Setup screen 05, "Dịch sang": checks that the language packs for the spoken language AND the target
 * are on the phone (Phase 21). The screen keeps Start disabled until the status is `ready` or `off`.
 */
export function useTranslationPacks(language: string | null, translateTo: string | null): TranslationPacks {
  const [status, setStatus] = useState<TranslationPackStatus>('off');
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [missing, setMissing] = useState<TranslationLanguage[]>([]);
  // A check or download that finished after the user changed language must not overwrite the newer state.
  const generation = useRef(0);

  useEffect(() => {
    const mine = ++generation.current;
    const current = () => mine === generation.current;
    if (!translateTo || !isSupported(language) || !isSupported(translateTo)) {
      setStatus('off');
      setError(null);
      return;
    }
    if (!isTranslationAvailable()) {
      setStatus('unavailable');
      return;
    }
    setStatus('checking');
    setError(null);
    const needed: TranslationLanguage[] = [language, translateTo];
    Promise.all(needed.map((l) => isModelDownloaded(l))).then(
      (present) => {
        if (!current()) return;
        const absent = needed.filter((_, i) => !present[i]);
        setMissing(absent);
        setStatus(absent.length === 0 ? 'ready' : 'missing');
      },
      () => {
        if (!current()) return;
        setError(PACK_CHECK_FAILED);
        setStatus('error');
      },
    );
    return () => {
      generation.current += 1; // unmount / change: invalidate this run
    };
  }, [language, translateTo, attempt]);

  const downloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearDownloadTimer = () => {
    if (downloadTimer.current) clearTimeout(downloadTimer.current);
    downloadTimer.current = null;
  };
  // Unmount: the watchdog goes with the screen, and a late download result only touches an unmounted hook.
  useEffect(() => clearDownloadTimer, []);

  const download = useCallback(() => {
    const mine = ++generation.current;
    const current = () => mine === generation.current;
    clearDownloadTimer();
    setStatus('downloading');
    setError(null);
    const fail = () => {
      if (!current()) return;
      generation.current += 1; // a result arriving later is stale
      clearDownloadTimer();
      setError(PACK_DOWNLOAD_FAILED);
      setStatus('error');
    };
    downloadTimer.current = setTimeout(fail, DOWNLOAD_TIMEOUT_MS);
    (async () => {
      for (const l of missing) await downloadModel(l, { wifiOnly: false });
    })().then(() => {
      if (!current()) return;
      clearDownloadTimer();
      setAttempt((n) => n + 1); // verify with a fresh check
    }, fail);
  }, [missing]);

  return { status, error, download, recheck: useCallback(() => setAttempt((n) => n + 1), []) };
}
