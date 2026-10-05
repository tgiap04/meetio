import { AudioQuality, IOSOutputFormat } from 'expo-audio';

/**
 * Recording settings for one chunk, flattened for the platform the way expo-audio's own (internal)
 * `createRecordingOptions` does for `useAudioRecorder` — the native constructor wants the
 * flattened shape, and the public API only exposes the hook.
 *
 * Mono 16 kHz AAC at 32 kbps: speech quality is plenty for Gemini and a 10s chunk stays ~40 KB,
 * far below the server's 1 MB cap.
 */
export interface ChunkRecordingOptions {
  extension: string;
  sampleRate: number;
  numberOfChannels: number;
  bitRate: number;
  isMeteringEnabled: boolean;
  outputFormat: string | number;
  audioEncoder?: string;
  audioQuality?: number;
}

export function chunkRecordingOptions(os: string, volume: boolean): ChunkRecordingOptions {
  const common = { extension: '.m4a', sampleRate: 16_000, numberOfChannels: 1, bitRate: 32_000, isMeteringEnabled: volume };
  return os === 'ios'
    ? { ...common, outputFormat: IOSOutputFormat.MPEG4AAC, audioQuality: AudioQuality.MEDIUM }
    : { ...common, outputFormat: 'mpeg4', audioEncoder: 'aac' };
}
