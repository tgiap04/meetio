import { Button, Platform, StyleSheet, Text, View } from 'react-native';
import type { DeviceCapabilities } from '../device-capabilities';

const yesNo = (v: boolean | null) =>
  v === null ? 'không xác định — chỉ lượt đo offline trả lời được' : v ? 'có' : 'KHÔNG';

export function CapabilityPanel({
  caps,
  onDownloadModel,
}: {
  caps: DeviceCapabilities | null;
  onDownloadModel: () => void;
}) {
  if (!caps) return <Text>Đang đọc khả năng của máy…</Text>;
  const missingOffline = caps.onDeviceSupported && caps.viInstalledOnDevice === false;
  return (
    <View style={styles.box}>
      <Text style={styles.title}>
        {caps.device} · {caps.os}
      </Text>
      <Text>Nhận diện khả dụng: {yesNo(caps.recognitionAvailable)}</Text>
      <Text>Hỗ trợ on-device: {yesNo(caps.onDeviceSupported)}</Text>
      {caps.onDeviceEnforced ? null : (
        <Text style={styles.warn}>
          Không ép được on-device trên máy này — chỉ đo được engine network
        </Text>
      )}
      <Text>vi-VN (network): {yesNo(caps.viSupported)}</Text>
      <Text style={missingOffline ? styles.warn : undefined}>
        vi-VN on-device: {yesNo(caps.viInstalledOnDevice)}
      </Text>
      {caps.defaultService ? <Text>Service mặc định: {caps.defaultService}</Text> : null}
      {missingOffline && Platform.OS === 'android' ? (
        <Button title="Tải model tiếng Việt offline" onPress={onDownloadModel} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { padding: 10, borderRadius: 8, backgroundColor: '#f3f4f6', marginBottom: 12 },
  title: { fontWeight: '700', marginBottom: 4 },
  warn: { color: '#b91c1c', fontWeight: '700' },
});
