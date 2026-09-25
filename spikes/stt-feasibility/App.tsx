// App spike một màn hình: chọn cấu hình lượt đo → Bắt đầu → bấm "Đánh dấu phát" đúng lúc bấm
// play trên laptop → để chạy hết 60 phút → Dừng → Chia sẻ log.

import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  AppState,
  Button,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import * as Sharing from 'expo-sharing';
import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';
import { CapabilityPanel } from './src/components/capability-panel';
import { RunConfigForm } from './src/components/run-config-form';
import { startKeepalive, stopKeepalive } from './src/background-keepalive';
import {
  readDeviceCapabilities,
  requestVietnameseOfflineModel,
  type DeviceCapabilities,
} from './src/device-capabilities';
import { openEventLogFile, type EventLogFile } from './src/event-log-file';
import { isNetworkReachable } from './src/network-probe';
import { bindRecognizerEvents, createExpoRecognizer } from './src/expo-recognizer-adapter';
import {
  createRecognitionController,
  RESTART_DELAY_MS,
  type ControllerStatus,
  type RecognitionController,
} from './src/recognition-controller';
import { DEFAULT_RUN_CONFIG, makeRunId, RECOGNITION_LANG, type RunConfig } from './src/run-config';

type Run = {
  controller: RecognitionController;
  log: EventLogFile;
  unbind: () => void;
  heartbeat: ReturnType<typeof setInterval>;
};

// JS thread còn chạy thì cứ 30s có một dòng. Khoảng trống lớn giữa hai heartbeat khi chạy nền
// là dấu hiệu trực tiếp app bị hệ điều hành treo — nhất là iOS giữa hai phiên nhận diện.
const HEARTBEAT_MS = 30_000;

export default function App() {
  const [caps, setCaps] = useState<DeviceCapabilities | null>(null);
  const [config, setConfig] = useState<RunConfig>(DEFAULT_RUN_CONFIG);
  const [status, setStatus] = useState<ControllerStatus | null>(null);
  const [lastLogUri, setLastLogUri] = useState<string | null>(null);
  const [writeError, setWriteError] = useState<string | null>(null);
  const [playbackMarked, setPlaybackMarked] = useState(false);
  const run = useRef<Run | null>(null);

  useEffect(() => {
    readDeviceCapabilities().then(setCaps, (err) =>
      Alert.alert('Không đọc được khả năng của máy', String(err)),
    );
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      const current = run.current;
      if (!current) return;
      // iOS đi qua `inactive` khi kéo trung tâm điều khiển — chưa phải xuống nền, không ghi.
      if (state === 'background') {
        current.log.append({ event: 'app_background', timestamp: Date.now() });
        current.log.flush();
      }
      if (state === 'active')
        current.log.append({ event: 'app_foreground', timestamp: Date.now() });
    });
    return () => sub.remove();
  }, []);

  async function start() {
    const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Thiếu quyền micro / nhận diện giọng nói');
      return;
    }
    const capabilities = caps ?? (await readDeviceCapabilities());
    const networkReachable = await isNetworkReachable();
    if (config.engine === 'on-device') {
      if (!capabilities.onDeviceEnforced) {
        Alert.alert(
          'Máy này không ép được on-device',
          'Android dưới 13 hoặc iOS không hỗ trợ on-device — ghi vào REPORT là "không đạt" cho engine on-device. Vẫn đo được engine network.',
        );
        return;
      }
      if (networkReachable) {
        Alert.alert(
          'Bật chế độ máy bay',
          'Lượt on-device phải chạy offline: đó là bằng chứng duy nhất rằng audio không rời máy (NFR-02).',
        );
        return;
      }
    }
    const runId = makeRunId(config, new Date());
    const log = openEventLogFile(runId, (err) => setWriteError(String(err)));
    log.append({
      event: 'run_meta',
      timestamp: Date.now(),
      run_id: runId,
      device: capabilities.device,
      os: capabilities.os,
      engine: config.engine,
      app_state: config.appState,
      placement: config.placement,
      distance_cm: config.placement === 'direct-voice' ? null : config.distanceCm,
      lang: RECOGNITION_LANG,
      restart_delay_ms: RESTART_DELAY_MS,
      network_reachable_at_start: networkReachable,
      capabilities,
    });

    await startKeepalive();
    // Lượt "tiền cảnh" phải giữ màn hình sáng suốt 60 phút, không thì nó thành lượt "khoá màn hình".
    if (config.appState === 'foreground') await activateKeepAwakeAsync('stt-spike');

    const controller = createRecognitionController({
      recognizer: createExpoRecognizer(config.engine),
      log: log.append,
      now: Date.now,
      schedule: (fn, ms) => {
        const id = setTimeout(fn, ms);
        return () => clearTimeout(id);
      },
      onStatus: setStatus,
    });
    const heartbeat = setInterval(
      () => log.append({ event: 'heartbeat', timestamp: Date.now() }),
      HEARTBEAT_MS,
    );
    run.current = { controller, log, unbind: bindRecognizerEvents(controller), heartbeat };
    setLastLogUri(log.uri);
    setWriteError(null);
    setPlaybackMarked(false);
    controller.start();
  }

  function markPlayback() {
    run.current?.controller.markPlayback();
    setPlaybackMarked(true);
  }

  async function stop() {
    const current = run.current;
    if (!current) return;
    run.current = null;
    clearInterval(current.heartbeat);
    current.controller.stop();
    current.unbind();
    current.log.close();
    deactivateKeepAwake('stt-spike');
    await stopKeepalive();
  }

  async function share() {
    if (lastLogUri)
      await Sharing.shareAsync(lastLogUri, {
        mimeType: 'application/x-ndjson',
        dialogTitle: 'Log STT spike',
      });
  }

  async function downloadModel() {
    try {
      Alert.alert('Model tiếng Việt', await requestVietnameseOfflineModel());
      setCaps(await readDeviceCapabilities());
    } catch (err) {
      Alert.alert('Không tải được model', String(err));
    }
  }

  const running = status?.running ?? false;
  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.content}>
        <CapabilityPanel caps={caps} onDownloadModel={downloadModel} />
        <RunConfigForm config={config} disabled={running} onChange={setConfig} />
        <View style={styles.actions}>
          {running ? (
            <Button title="Dừng" color="#b91c1c" onPress={stop} />
          ) : (
            <Button title="Bắt đầu" onPress={start} />
          )}
          <Button
            title={playbackMarked ? 'Đã đánh dấu phát ✓' : 'Đánh dấu phát'}
            disabled={!running || playbackMarked}
            onPress={markPlayback}
          />
          <Button title="Chia sẻ log" disabled={running || !lastLogUri} onPress={share} />
        </View>
        {writeError ? (
          <Text style={styles.error}>Ghi log lỗi — lượt này không dùng được: {writeError}</Text>
        ) : null}
        {status ? (
          <View style={styles.status}>
            <Text>
              Phiên {status.sessionId ?? '—'} · {status.restarts} restart ·{' '}
              {run.current?.log.lineCount() ?? 0} dòng log
            </Text>
            <Text style={styles.transcript}>{status.lastText}</Text>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 16, paddingTop: 48 },
  actions: { gap: 8, marginVertical: 12 },
  status: { marginTop: 8 },
  transcript: { marginTop: 8, fontSize: 16 },
  error: { color: '#b91c1c', fontWeight: '700' },
});
