/**
 * The recognition engine behind the recording screen — the swap point Phase 07 promised: if the
 * Phase 00 measurements force cloud STT, only the implementation of this interface changes.
 *
 * In continuous mode every `final` result is a NEW utterance (both platforms, per
 * expo-speech-recognition); `partial` results are the volatile text of the utterance in progress.
 */
export interface SttStartOptions {
  /** BCP-47 tag, one of `listRecordingLanguages()`. */
  lang: string;
  /** Word-by-word partial results (quality `high`); `false` = only finished sentences (`standard`). */
  interim: boolean;
  /** Let the OS route input from a Bluetooth headset (US-42). */
  bluetooth: boolean;
  /** Server engine only: whose meeting the audio belongs to (owner guard + usage attribution). */
  upload?: { ownerId: string; meetingId: string };
  /** Emit input levels for the waveform (quality `high`). */
  volume: boolean;
}

export interface SttHandlers {
  onStart(): void;
  onResult(text: string, isFinal: boolean): void;
  onError(code: string, message: string): void;
  onEnd(): void;
  /** Input level, roughly -2 (silence) … 10 (loud). */
  onVolume(value: number): void;
  /**
   * Audio of `ms` was lost (server engine only: a chunk that could not be transcribed). Shown in
   * the transcript as "— Gián đoạn N giây —" before the next segment, like a restart gap.
   */
  onGap?(ms: number): void;
}

export interface SttEngine {
  start(options: SttStartOptions): void;
  stop(): void;
  /** Subscribes to engine events; returns the unsubscribe. */
  subscribe(handlers: SttHandlers): () => void;
}

/** Languages Meetio offers, in display order. */
export const RECORDING_LANGUAGES = [
  { tag: 'vi-VN', label: 'Tiếng Việt' },
  { tag: 'en-US', label: 'Tiếng Anh' },
] as const;

export type RecordingLanguage = (typeof RECORDING_LANGUAGES)[number];

const sameLanguage = (a: string, b: string) => a.toLowerCase().replace('_', '-') === b.toLowerCase();

/** Device's own language first when it is one of the offered ones (US-12). */
function deviceLanguageFirst(available: RecordingLanguage[], deviceLanguageTag?: string): RecordingLanguage[] {
  const deviceFirst = available.find((l) => deviceLanguageTag && l.tag.split('-')[0] === deviceLanguageTag.split('-')[0]);
  return deviceFirst ? [deviceFirst, ...available.filter((l) => l !== deviceFirst)] : available;
}

/**
 * US-12: on-device mode lists only what the device really supports offline (NFR-02: audio stays
 * on the phone), with the device's own language first when it is one of them.
 */
export function pickRecordingLanguages(installedLocales: string[], deviceLanguageTag?: string): RecordingLanguage[] {
  const available = RECORDING_LANGUAGES.filter((l) => installedLocales.some((installed) => sameLanguage(installed, l.tag)));
  return deviceLanguageFirst(available, deviceLanguageTag);
}

/** Server mode (Phase 18): the server recognises every offered language, so all are listed. */
export function pickServerRecordingLanguages(deviceLanguageTag?: string): RecordingLanguage[] {
  return deviceLanguageFirst([...RECORDING_LANGUAGES], deviceLanguageTag);
}

/**
 * How speech becomes text on this phone: `on_device` whenever it can recognise at least one
 * offered language offline (audio never leaves the phone), otherwise `server` — audio chunks go
 * to the Meetio API (Phase 18).
 */
export type RecognitionMode = 'on_device' | 'server';

export function resolveRecognitionMode(installedLocales: string[]): RecognitionMode {
  return pickRecordingLanguages(installedLocales).length > 0 ? 'on_device' : 'server';
}
