// Nối expo-speech-recognition (SpeechRecognizer / SFSpeechRecognizer) vào recognition-controller.

import {
  ExpoSpeechRecognitionModule,
  type ExpoSpeechRecognitionOptions,
} from 'expo-speech-recognition';
import type { RecognizerPort, RecognitionController } from './recognition-controller';
import { RECOGNITION_LANG, type Engine } from './run-config';

export function buildRecognitionOptions(engine: Engine): ExpoSpeechRecognitionOptions {
  return {
    lang: RECOGNITION_LANG,
    interimResults: true,
    maxAlternatives: 1,
    // Không continuous thì Android dừng sau mỗi câu và iOS ≤17 dừng sau 3 giây im lặng —
    // spike cần đo trần của chế độ tốt nhất mà nền tảng cho, không phải chế độ câu lệnh ngắn.
    continuous: true,
    // Mặc định cả hai nền tảng đẩy audio lên máy chủ Google/Apple. Lượt "on-device" bắt buộc
    // cờ này — đây chính là điều NFR-02 hứa với người dùng.
    requiresOnDeviceRecognition: engine === 'on-device',
    // iOS tự thêm dấu câu, Android thì không; tắt đi để hai nền tảng so được với nhau.
    addsPunctuation: false,
    iosTaskHint: 'dictation',
  };
}

export function createExpoRecognizer(engine: Engine): RecognizerPort {
  const options = buildRecognitionOptions(engine);
  return {
    start: () => ExpoSpeechRecognitionModule.start(options),
    stop: () => ExpoSpeechRecognitionModule.stop(),
  };
}

export function bindRecognizerEvents(controller: RecognitionController): () => void {
  const subscriptions = [
    ExpoSpeechRecognitionModule.addListener('start', () => controller.handleStart()),
    ExpoSpeechRecognitionModule.addListener('end', () => controller.handleEnd()),
    ExpoSpeechRecognitionModule.addListener('result', (e) =>
      controller.handleResult(e.results[0]?.transcript ?? '', e.isFinal),
    ),
    ExpoSpeechRecognitionModule.addListener('error', (e) =>
      controller.handleError(e.error, e.message),
    ),
  ];
  return () => subscriptions.forEach((s) => s.remove());
}
