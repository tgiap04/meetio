import { requireOptionalNativeModule } from 'expo-modules-core';
import type { DownloadModelOptions, NativeMlkitTranslate, TranslationLanguage } from './mlkit-translate.types';

export type { DownloadModelOptions, TranslationLanguage } from './mlkit-translate.types';

const ML_KIT_CODES: Record<TranslationLanguage, string> = { 'vi-VN': 'vi', 'en-US': 'en' };

/** The native module is absent in Expo Go, on web and in Jest — callers get a clear error, never a crash on import. */
export class TranslationUnavailableError extends Error {
  constructor() {
    super('Dịch trên máy chưa khả dụng trong bản cài này.');
    this.name = 'TranslationUnavailableError';
  }
}

// Resolved per call (expo caches the lookup) so importing this file never touches native code.
const lookup = () => requireOptionalNativeModule<NativeMlkitTranslate>('MlkitTranslate');

function nativeModule(): NativeMlkitTranslate {
  const native = lookup();
  if (!native) throw new TranslationUnavailableError();
  return native;
}

function codeOf(language: string): string {
  const code = ML_KIT_CODES[language as TranslationLanguage];
  if (!code) throw new Error(`Unsupported translation language: ${language}`);
  return code;
}

export const isTranslationAvailable = (): boolean => lookup() != null;

export async function isModelDownloaded(language: TranslationLanguage): Promise<boolean> {
  return nativeModule().isModelDownloaded(codeOf(language));
}

/** Resolves when the pack is on the phone. ML Kit reports no byte progress, so callers show an indeterminate state. */
export async function downloadModel(language: TranslationLanguage, options: DownloadModelOptions = {}): Promise<void> {
  return nativeModule().downloadModel(codeOf(language), { wifiOnly: options.wifiOnly ?? false });
}

export async function deleteModel(language: TranslationLanguage): Promise<void> {
  return nativeModule().deleteModel(codeOf(language));
}

/** Translates entirely on the device; fails (never downloads) when a language pack is missing. */
export async function translate(text: string, source: TranslationLanguage, target: TranslationLanguage): Promise<string> {
  const from = codeOf(source);
  const to = codeOf(target);
  if (from === to) return text;
  const result = await nativeModule().translate(text, from, to);
  if (typeof result !== 'string') throw new Error('Unexpected translation result');
  return result;
}
