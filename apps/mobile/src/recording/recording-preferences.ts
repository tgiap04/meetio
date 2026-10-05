import * as SecureStore from 'expo-secure-store';
import { AudioSource, RecordingQuality } from '@meetio/shared';

/**
 * The last audio source and quality, remembered for the next session (US-42, US-43). Kept in
 * secure-store like the other device preferences (device-preferences.ts) — not sensitive, just
 * already a dependency with a Jest mock. Any unreadable value falls back to the recommended default.
 */
const KEY = 'meetio.recording_preferences';

export interface RecordingPreferences {
  audioSource: AudioSource;
  quality: RecordingQuality;
  language: string | null;
  /** Phase 09: the language to translate into while recording; null = "Không dịch" (the default — translation costs extra AI). */
  translateTo: string | null;
}

/** The only languages the app translates between (api: `translate_to` ∈ {vi-VN, en-US}, ≠ the source language). */
export const TRANSLATION_LANGUAGES = ['vi-VN', 'en-US'] as const;

export const DEFAULT_RECORDING_PREFERENCES: RecordingPreferences = {
  audioSource: AudioSource.DEVICE_MIC,
  quality: RecordingQuality.HIGH,
  language: null,
  translateTo: null,
};

const oneOf = <T extends string>(value: unknown, allowed: Record<string, T>): value is T =>
  typeof value === 'string' && (Object.values(allowed) as string[]).includes(value);

export async function readRecordingPreferences(): Promise<RecordingPreferences> {
  try {
    const raw = JSON.parse((await SecureStore.getItemAsync(KEY)) ?? '{}') as Partial<Record<keyof RecordingPreferences, unknown>>;
    return {
      audioSource: oneOf(raw.audioSource, AudioSource) ? raw.audioSource : DEFAULT_RECORDING_PREFERENCES.audioSource,
      quality: oneOf(raw.quality, RecordingQuality) ? raw.quality : DEFAULT_RECORDING_PREFERENCES.quality,
      language: typeof raw.language === 'string' ? raw.language : null,
      translateTo: (TRANSLATION_LANGUAGES as readonly unknown[]).includes(raw.translateTo) ? (raw.translateTo as string) : null,
    };
  } catch {
    return DEFAULT_RECORDING_PREFERENCES;
  }
}

export async function writeRecordingPreferences(preferences: RecordingPreferences): Promise<void> {
  await SecureStore.setItemAsync(KEY, JSON.stringify(preferences));
}
