import { Platform } from 'react-native';
import { ExpoSpeechRecognitionModule, type ExpoSpeechRecognitionOptions } from 'expo-speech-recognition';
import type { SttEngine, SttStartOptions } from './stt-engine';

/**
 * The only file that imports expo-speech-recognition. On-device recognition is REQUIRED — the
 * privacy policy promises audio never leaves the phone (NFR-02), and without the flag both
 * platforms quietly stream audio to Google/Apple. Settings mirror the Phase 00 spike.
 */
export function buildRecognitionOptions(options: SttStartOptions): ExpoSpeechRecognitionOptions {
  return {
    lang: options.lang,
    interimResults: options.interim,
    maxAlternatives: 1,
    continuous: true,
    requiresOnDeviceRecognition: true,
    addsPunctuation: false,
    iosTaskHint: 'dictation',
    ...(options.volume ? { volumeChangeEventOptions: { enabled: true, intervalMillis: 150 } } : {}),
    ...(options.bluetooth
      ? { iosCategory: { category: 'playAndRecord', categoryOptions: ['allowBluetooth', 'defaultToSpeaker'], mode: 'measurement' } }
      : {}),
  };
}

export const expoSttEngine: SttEngine = {
  start: (options) => ExpoSpeechRecognitionModule.start(buildRecognitionOptions(options)),
  stop: () => ExpoSpeechRecognitionModule.stop(),
  subscribe(handlers) {
    const subscriptions = [
      ExpoSpeechRecognitionModule.addListener('start', () => handlers.onStart()),
      ExpoSpeechRecognitionModule.addListener('end', () => handlers.onEnd()),
      ExpoSpeechRecognitionModule.addListener('result', (e) => handlers.onResult(e.results[0]?.transcript ?? '', e.isFinal)),
      ExpoSpeechRecognitionModule.addListener('error', (e) => handlers.onError(e.error, e.message)),
      ExpoSpeechRecognitionModule.addListener('volumechange', (e) => handlers.onVolume(e.value)),
    ];
    return () => subscriptions.forEach((s) => s.remove());
  },
};

/**
 * Locales the device can recognise OFFLINE. Empty when it cannot recognise on-device at all:
 * Android below 13 only gets a "prefer offline" hint that may still use the network, and iOS
 * reports per-locale on-device support through the patched `installedLocales`
 * (.yarn/patches/expo-speech-recognition-*.patch).
 */
export async function getOnDeviceLocales(): Promise<string[]> {
  if (Platform.OS === 'android' && Number(Platform.Version) < 33) return [];
  try {
    return (await ExpoSpeechRecognitionModule.getSupportedLocales({})).installedLocales;
  } catch {
    return [];
  }
}

/** Microphone + speech-recognition permission in one prompt flow (US-07). */
export async function requestRecordingPermissions(): Promise<{ granted: boolean; canAskAgain: boolean }> {
  const result = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
  return { granted: result.granted, canAskAgain: result.canAskAgain };
}
