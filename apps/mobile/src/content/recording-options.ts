import { AudioSource, RecordingQuality } from '@meetio/shared';

export interface RecordingOption<T extends string = string> {
  readonly id: T;
  readonly label: string;
  readonly description?: string;
}

/** US-42 — labels from design screen 05; the Bluetooth description says what the app really does. */
export const AUDIO_SOURCE_OPTIONS: readonly RecordingOption<AudioSource>[] = [
  { id: AudioSource.DEVICE_MIC, label: 'Micro trên thiết bị', description: 'Ghi âm từ microphone điện thoại' },
  {
    id: AudioSource.EXTERNAL_BLUETOOTH,
    label: 'Thiết bị ngoài (Bluetooth)',
    description: 'Dùng tai nghe hoặc micro Bluetooth đang kết nối với máy',
  },
];

/** Shown when "Thiết bị ngoài" is picked — the app cannot see Bluetooth devices, the OS routes them. */
export const BLUETOOTH_HINT =
  'Kết nối thiết bị Bluetooth trong Cài đặt của máy trước khi bắt đầu. Nếu thiết bị ngắt giữa chừng, máy tự chuyển về micro điện thoại và buổi ghi vẫn tiếp tục.';

/** US-43 — each level states its trade-off in plain words, the recommended one first. */
export const QUALITY_OPTIONS: readonly RecordingOption<RecordingQuality>[] = [
  { id: RecordingQuality.HIGH, label: 'Chất lượng cao (khuyến nghị)', description: 'Chữ hiện ngay từng từ, có sóng âm. Tốn pin hơn.' },
  { id: RecordingQuality.STANDARD, label: 'Tiết kiệm pin', description: 'Chữ hiện khi dứt câu, không vẽ sóng âm. Dùng cho cuộc họp dài.' },
];
