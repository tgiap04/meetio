/**
 * Recording-setup screen options, transcribed from
 * `design/screen-05-cai-dat-ghi-am.png`. The design shows a full option list
 * only for audio source; language, translation target and quality mode each
 * show a single currently-selected value with no expanded list drawn, so
 * those are captured as defaults rather than option arrays.
 */
import type { RecordingOption, RecordingSettingsDefaults } from './types';

export const AUDIO_SOURCE_OPTIONS: readonly RecordingOption[] = [
  {
    id: 'device-microphone',
    label: 'Micro trên thiết bị',
    description: 'Ghi âm từ microphone điện thoại',
  },
  {
    id: 'external-device',
    label: 'Thiết bị ngoài',
    description: 'Kết nối thiết bị âm thanh qua Bluetooth',
  },
] as const satisfies readonly RecordingOption[];

export const RECORDING_SETTINGS_DEFAULTS: RecordingSettingsDefaults = {
  language: 'Tiếng Việt',
  translationEnabled: true,
  translationTarget: 'Tiếng Anh',
  qualityMode: 'Chất lượng cao (khuyến nghị)',
} as const satisfies RecordingSettingsDefaults;
