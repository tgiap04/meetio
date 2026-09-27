import { useEffect, useState } from 'react';
import { getOnDeviceLocales } from '../recording/expo-stt-engine';
import { pickRecordingLanguages, type RecordingLanguage } from '../recording/stt-engine';
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
  languages: RecordingLanguage[];
  preferences: RecordingPreferences;
  update(patch: Partial<RecordingPreferences>): void;
}

/**
 * Screen 05's data: the languages this device can recognise ON-DEVICE (US-12, NFR-02) and the
 * last audio source / quality / language, remembered across sessions (US-42, US-43). A language
 * remembered but no longer installed falls back to the first available one.
 */
export function useRecordingSetup(): RecordingSetupState {
  const [loading, setLoading] = useState(true);
  const [languages, setLanguages] = useState<RecordingLanguage[]>([]);
  const [preferences, setPreferences] = useState<RecordingPreferences>(DEFAULT_RECORDING_PREFERENCES);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([getOnDeviceLocales(), readRecordingPreferences()]).then(([installed, saved]) => {
      if (cancelled) return;
      const available = pickRecordingLanguages(installed, deviceLanguageTag());
      const language = available.some((l) => l.tag === saved.language) ? saved.language : (available[0]?.tag ?? null);
      setLanguages(available);
      setPreferences({ ...saved, language });
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return {
    loading,
    languages,
    preferences,
    update(patch) {
      setPreferences((current) => {
        const next = { ...current, ...patch };
        void writeRecordingPreferences(next).catch(() => undefined);
        return next;
      });
    },
  };
}
