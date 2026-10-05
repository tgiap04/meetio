import { AudioModule, getRecordingPermissionsAsync, setAudioModeAsync } from 'expo-audio';
import { STT_STREAM_SAMPLE_RATE } from '@meetio/shared';
import { ServerSttError } from './server-stt-ports';
import type { PcmSource } from './server-stream-stt-ports';

/**
 * The microphone as a PCM stream (Phase 19), through expo-audio's `AudioStream` — its hook,
 * `useAudioStream`, only builds the shared object and subscribes to its buffer event, so this does
 * the same without React. 16 kHz mono int16 is requested; the engine converts whatever the
 * hardware delivers instead.
 *
 * Background: `AudioStream` starts no foreground service of its own. The session starts the
 * react-native-background-actions microphone service (background-keepalive.ts) before it starts the
 * engine, and that service is what keeps recording with the screen off on Android; on iOS
 * `UIBackgroundModes: audio` plus the active audio session do. Whether the stream survives a
 * locked screen for 10+ minutes on a Xiaomi is the open device spike (plans/…/phase-19-streaming-stt.md).
 */
export function createNativeMic(): PcmSource {
  let stream: InstanceType<typeof AudioModule.AudioStream> | null = null;
  let subscription: { remove(): void } | null = null;

  function release() {
    subscription?.remove();
    subscription = null;
    try {
      stream?.stop();
    } catch {
      // never started, or already stopped
    }
    stream?.release();
    stream = null;
  }

  return {
    async start(onBuffer) {
      if (!(await getRecordingPermissionsAsync()).granted) {
        throw new ServerSttError('not-allowed', 'Microphone permission not granted');
      }
      try {
        await setAudioModeAsync({
          allowsRecording: true,
          allowsBackgroundRecording: true,
          shouldPlayInBackground: true,
          playsInSilentMode: true,
          interruptionMode: 'doNotMix',
        });
        stream = new AudioModule.AudioStream({ sampleRate: STT_STREAM_SAMPLE_RATE, channels: 1, encoding: 'int16' });
        subscription = stream.addListener('audioStreamBuffer', (buffer) => onBuffer(buffer));
        await stream.start();
      } catch (error) {
        release();
        throw new ServerSttError('audio-capture', error instanceof Error ? error.message : 'Cannot open the microphone');
      }
    },

    stop: release,
  };
}
