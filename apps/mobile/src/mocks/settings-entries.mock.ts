/**
 * Settings-tab rows, transcribed from `design/screen-14-cai-dat.png`. The
 * profile header on that screen (name, email, avatar) is real `/me` data
 * per `clarifications.md` and is intentionally not fixture content here —
 * only the five setting rows plus the two "Về Meetio" rows are net-new.
 */
import type { SettingsEntry } from './types';

export const SETTINGS_ENTRIES: readonly SettingsEntry[] = [
  {
    id: 'language',
    icon: 'globe',
    label: 'Ngôn ngữ',
    value: 'Tiếng Việt',
  },
  {
    id: 'translation',
    icon: 'clock',
    label: 'Dịch thuật',
    value: 'English → Vietnamese',
  },
  {
    id: 'recording-settings',
    icon: 'clock',
    label: 'Cài đặt ghi âm',
    value: 'Chất lượng cao',
  },
  {
    id: 'ai-graphrag',
    icon: 'cpu',
    label: 'AI & GraphRAG',
    value: 'Gemini',
  },
  {
    id: 'storage',
    icon: 'archive',
    label: 'Lưu trữ',
    value: 'Quản lý dữ liệu',
  },
] as const satisfies readonly SettingsEntry[];

export const ABOUT_MEETIO_ENTRIES: readonly SettingsEntry[] = [
  {
    id: 'privacy-policy',
    icon: 'shield',
    label: 'Chính sách bảo mật',
  },
  {
    id: 'terms-of-use',
    icon: 'shield',
    label: 'Điều khoản sử dụng',
  },
] as const satisfies readonly SettingsEntry[];
