import { Platform } from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';
import { AudioModule, getRecordingPermissionsAsync, requestRecordingPermissionsAsync, setAudioModeAsync } from 'expo-audio';
import { transcribeAudioChunk } from '../api/stt';
import { OwnerMismatchError } from '../api/axios-client';
import { tokenSubject } from '../api/token-subject';
import { useSessionStore } from '../store/session.store';
import { createServerSttEngine } from './server-stt-engine';
import { chunkDirectoryName, purgeChunkFiles } from './server-stt-chunk-files';
import { chunkRecordingOptions } from './server-stt-recording-options';
import { ServerSttError, type ChunkRecorder } from './server-stt-ports';

/**
 * The only file that imports expo-audio for recognition: the thin native adapter under the pure
 * core in server-stt-engine.ts. expo-audio's recorder is only exposed as a hook, so the shared
 * object is built the same way `useAudioRecorder` does it, minus React. Recording continues with
 * the screen off through the foreground service (Android) / `UIBackgroundModes: audio` (iOS).
 */

/** Deletes chunk files a killed app left in the cache (see server-stt-chunk-files.ts). */
export function purgeStaleChunks(): void {
  try {
    purgeChunkFiles(new Directory(Paths.cache, chunkDirectoryName(Platform.OS)));
  } catch {
    // The cache directory is unreadable right now; the next open / app start purges again.
  }
}

function createNativeRecorder(): ChunkRecorder {
  let recorder: InstanceType<typeof AudioModule.AudioRecorder> | null = null;
  let options = chunkRecordingOptions(Platform.OS, false);

  return {
    async open({ volume }) {
      if (!(await getRecordingPermissionsAsync()).granted) {
        throw new ServerSttError('not-allowed', 'Microphone permission not granted');
      }
      options = chunkRecordingOptions(Platform.OS, volume);
      purgeStaleChunks();
      try {
        await setAudioModeAsync({
          allowsRecording: true,
          allowsBackgroundRecording: true,
          shouldPlayInBackground: true,
          playsInSilentMode: true,
          interruptionMode: 'doNotMix',
        });
        // The native constructor takes the platform-flattened options, like `useAudioRecorder` passes it;
        // its typings still describe the nested shape, hence the cast.
        recorder = new AudioModule.AudioRecorder(options as never);
      } catch (error) {
        throw new ServerSttError('audio-capture', error instanceof Error ? error.message : 'Cannot open the microphone');
      }
    },

    async begin() {
      if (!recorder) throw new ServerSttError('audio-capture', 'Recorder is not open');
      try {
        await recorder.prepareToRecordAsync(); // uses the options the recorder was created with
        recorder.record();
      } catch (error) {
        throw new ServerSttError('audio-capture', error instanceof Error ? error.message : 'Cannot start recording');
      }
    },

    async finish() {
      if (!recorder) return null;
      await recorder.stop();
      return recorder.uri;
    },

    level() {
      // `metering` is dBFS; absent when metering is off or the recorder is between two chunks.
      try {
        return recorder?.isRecording ? (recorder.getStatus().metering ?? null) : null;
      } catch {
        return null;
      }
    },

    close() {
      recorder?.release();
      recorder = null;
    },
  };
}

const schedule = (fn: () => void, ms: number) => {
  const timer = setTimeout(fn, ms);
  return () => clearTimeout(timer);
};

/** Throws when the signed-in user is not `ownerId` — shared by the chunked and the streaming engine. */
export function verifyRecordingOwner(ownerId: string): void {
  if (tokenSubject(useSessionStore.getState().accessToken) !== ownerId) throw new OwnerMismatchError();
}

export const serverSttEngine = createServerSttEngine({
  recorder: createNativeRecorder(),
  transcribe: (uri, language, upload) => {
    if (!upload) return Promise.reject(new Error('Upload context missing'));
    return transcribeAudioChunk(uri, language, upload);
  },
  verifyOwner: verifyRecordingOwner,
  isFatal: (error) => error instanceof OwnerMismatchError,
  deleteFile: async (uri) => new File(uri).delete(),
  now: Date.now,
  schedule,
});

/** Microphone permission only — server mode needs no speech-recognition permission. */
export async function requestServerRecordingPermissions(): Promise<{ granted: boolean; canAskAgain: boolean }> {
  const result = await requestRecordingPermissionsAsync();
  return { granted: result.granted, canAskAgain: result.canAskAgain };
}
