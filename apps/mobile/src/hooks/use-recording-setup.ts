import { useEffect, useState } from 'react';
import { getOnDeviceLocales } from '../recording/expo-stt-engine';
import {
  pickRecordingLanguages,
  pickServerRecordingLanguages,
  resolveRecognitionMode,
  type RecognitionMode,
  type RecordingLanguage,
} from '../recording/stt-engine';
import {
  DEFAULT_RECORDING_PREFERENCES,
  readRecordingPreferences,
  writeRecordingPreferences,
  type RecordingPreferences,
} from '../recording/recording-preferences';

/** The device language (Hermes ships Intl) — US-12's default. No extra dependency needed. */
function deviceLanguageTag(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale;
  } catch {
    return undefined;
  }
}

export interface RecordingSetupState {
  loading: boolean;
  /** How this phone recognises speech; `null` until known. */
  mode: RecognitionMode | null;
  /** The phone could not say what it can recognise on-device — no mode is chosen, never "server" by default. */
  checkFailed: boolean;
  retryCheck(): void;
  languages: RecordingLanguage[];
  preferences: RecordingPreferences;
  update(patch: Partial<RecordingPreferences>): void;
}

/**
 * Screen 05's data: how this phone recognises speech, the languages it offers and the last audio
 * source / quality / language, remembered across sessions (US-42, US-43). With on-device support
 * only the installed languages are offered (US-12, NFR-02); without it (Phase 18) the server
 * handles every language. A language remembered but no longer offered falls back to the first one.
 */
export function useRecordingSetup(): RecordingSetupState {
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<RecognitionMode | null>(null);
  const [checkFailed, setCheckFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [languages, setLanguages] = useState<RecordingLanguage[]>([]);
  const [preferences, setPreferences] = useState<RecordingPreferences>(DEFAULT_RECORDING_PREFERENCES);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setCheckFailed(false);
    void Promise.all([getOnDeviceLocales(), readRecordingPreferences()]).then(([installed, saved]) => {
      if (cancelled) return;
      const recognitionMode = resolveRecognitionMode(installed);
      const available =
        recognitionMode === 'on_device' ? pickRecordingLanguages(installed, deviceLanguageTag()) : pickServerRecordingLanguages(deviceLanguageTag());
      const language = available.some((l) => l.tag === saved.language) ? saved.language : (available[0]?.tag ?? null);
      setMode(recognitionMode);
      setLanguages(available);
      setPreferences({ ...saved, language, translateTo: saved.translateTo === language ? null : saved.translateTo });
      setLoading(false);
    }, () => {
      // A native failure must not read as "no on-device support": that would send audio to the server.
      if (cancelled) return;
      setMode(null);
      setLanguages([]);
      setCheckFailed(true);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  return {
    loading,
    mode,
    checkFailed,
    retryCheck: () => setAttempt((n) => n + 1),
    languages,
    preferences,
    update(patch) {
      setPreferences((current) => {
        const next = { ...current, ...patch };
        // Translating a language into itself is meaningless: changing the spoken language to the target turns translation off.
        if (next.translateTo !== null && next.translateTo === next.language) next.translateTo = null;
        void writeRecordingPreferences(next).catch(() => undefined);
        return next;
      });
    },
  };
}
