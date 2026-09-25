// Cấu hình một lượt đo — ghi nguyên vào dòng run_meta để analysis/ điền được bảng REPORT.md.

export type Engine = 'on-device' | 'network';
export type AppStateMode = 'foreground' | 'background' | 'locked';
export type Placement = 'laptop-speaker' | 'direct-voice';

export type RunConfig = {
  engine: Engine;
  appState: AppStateMode;
  placement: Placement;
  distanceCm: 30 | 50;
};

export const DEFAULT_RUN_CONFIG: RunConfig = {
  engine: 'on-device',
  appState: 'foreground',
  placement: 'laptop-speaker',
  distanceCm: 30,
};

// Bản ghi mẫu là cuộc họp tiếng Việt thật (phase-00 · Rủi ro). Không cho chọn ngôn ngữ khác để
// không ai vô tình đo tiếng Anh rồi suy ra tiếng Việt.
export const RECOGNITION_LANG = 'vi-VN';

export function makeRunId(config: RunConfig, now: Date): string {
  const stamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return `${stamp}_${config.engine}_${config.appState}_${config.placement}_${config.distanceCm}cm`;
}
