/**
 * Test-only stand-in for expo-speech-recognition's native module (wired in jest.setup.ts). Tests
 * drive recognition by emitting the same events the native side would: `start`, `result`,
 * `error`, `end`, `volumechange`.
 */
type Listener = (event: never) => void;

const listeners = new Map<string, Set<Listener>>();

export const fakeSpeech = {
  installedLocales: ['vi-VN', 'en-US'] as string[],
  /** Makes `getSupportedLocales` reject, like a native failure. */
  localesError: null as Error | null,
  permission: { granted: true, canAskAgain: true },
  starts: [] as unknown[],
  stops: 0,
  emit(name: string, event: unknown = {}) {
    for (const l of listeners.get(name) ?? []) (l as (e: unknown) => void)(event);
  },
  result(transcript: string, isFinal: boolean) {
    this.emit('result', { isFinal, results: [{ transcript, confidence: 1, segments: [] }] });
  },
  reset() {
    listeners.clear();
    this.installedLocales = ['vi-VN', 'en-US'];
    this.localesError = null;
    this.permission = { granted: true, canAskAgain: true };
    this.starts = [];
    this.stops = 0;
  },
};

export const ExpoSpeechRecognitionModule = {
  start: (options: unknown) => void fakeSpeech.starts.push(options),
  stop: () => void (fakeSpeech.stops += 1),
  abort: () => void (fakeSpeech.stops += 1),
  addListener(name: string, listener: Listener) {
    if (!listeners.has(name)) listeners.set(name, new Set());
    listeners.get(name)!.add(listener);
    return { remove: () => listeners.get(name)?.delete(listener) };
  },
  getSupportedLocales: async () => {
    if (fakeSpeech.localesError) throw fakeSpeech.localesError;
    return { locales: fakeSpeech.installedLocales, installedLocales: fakeSpeech.installedLocales };
  },
  supportsOnDeviceRecognition: () => true,
  requestPermissionsAsync: async () => fakeSpeech.permission,
  getPermissionsAsync: async () => fakeSpeech.permission,
};
