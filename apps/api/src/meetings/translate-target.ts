/** Languages the app records and translates between (phase 09). */
export const TRANSLATION_LANGUAGES = ['vi-VN', 'en-US'] as const;

/**
 * Why `translateTo` is not acceptable for a meeting recorded in `sourceLanguage`,
 * or null when it is fine. null/undefined mean "translation off" and are fine.
 */
export function translateToViolation(translateTo: string | null | undefined, sourceLanguage: string): string | null {
  if (translateTo === null || translateTo === undefined) return null;
  if (!(TRANSLATION_LANGUAGES as readonly string[]).includes(translateTo)) {
    return `Chỉ dịch sang ${TRANSLATION_LANGUAGES.join(' hoặc ')}`;
  }
  return translateTo === sourceLanguage ? 'Ngôn ngữ dịch phải khác ngôn ngữ ghi âm' : null;
}
