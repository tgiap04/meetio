// Một dòng JSONL. `event` theo phase-00: start | partial | final | auto_stop | restart | error |
// app_background — cộng thêm vài sự kiện mà analysis/ cần để tính đúng số liệu:
//   run_meta       dòng đầu tiên, mô tả máy + cấu hình lượt đo
//   mark_playback  mốc người đo bấm "phát" trên laptop — gốc thời gian để khớp với bản chép tay
//   app_foreground app quay lại tiền cảnh (đóng khoảng chạy nền)
//   user_stop      người đo chủ động dừng — không phải lần tự ngắt
//   run_stop       kết thúc lượt đo
//   heartbeat      mỗi 30s khi JS thread còn sống — khoảng trống = app bị hệ điều hành treo
export type LogEventName =
  | 'run_meta'
  | 'mark_playback'
  | 'start'
  | 'partial'
  | 'final'
  | 'auto_stop'
  | 'restart'
  | 'error'
  | 'app_background'
  | 'app_foreground'
  | 'user_stop'
  | 'run_stop'
  | 'heartbeat';

export type LogEvent = {
  event: LogEventName;
  timestamp: number;
  session_id?: string;
  text?: string;
  error?: string;
  [extra: string]: unknown;
};

export type LogSink = (event: LogEvent) => void;
