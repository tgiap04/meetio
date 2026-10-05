/** The two languages Meetio records in and translates between (BCP-47 tags used across the app). */
export type TranslationLanguage = 'vi-VN' | 'en-US';

export interface DownloadModelOptions {
  /** Only download on Wi-Fi. Defaults to `false` — the user already confirmed on the setup screen. */
  wifiOnly?: boolean;
}

/** What the native side exposes; it speaks ML Kit language codes ("vi", "en"), not BCP-47 tags. */
export interface NativeMlkitTranslate {
  isModelDownloaded(language: string): Promise<boolean>;
  downloadModel(language: string, options: { wifiOnly: boolean }): Promise<void>;
  deleteModel(language: string): Promise<void>;
  translate(text: string, source: string, target: string): Promise<string>;
}
