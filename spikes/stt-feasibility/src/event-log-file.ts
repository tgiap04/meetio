// Ghi log JSONL ra Documents/runs/<run>.jsonl.
// Gom dòng vào bộ đệm rồi nối vào file mỗi 2 giây: partial có thể tới vài lần mỗi giây, ghi đĩa
// từng dòng sẽ tự làm nhiễu phép đo. Xuống nền thì xả ngay — có thể không còn cơ hội nào sau đó.

import { Directory, File, Paths } from 'expo-file-system';
import type { LogEvent } from './log-event';

const FLUSH_INTERVAL_MS = 2000;

export type EventLogFile = {
  uri: string;
  append: (event: LogEvent) => void;
  flush: () => void;
  close: () => void;
  lineCount: () => number;
};

export function openEventLogFile(
  runId: string,
  onWriteError: (err: unknown) => void,
): EventLogFile {
  const dir = new Directory(Paths.document, 'runs');
  if (!dir.exists) dir.create({ intermediates: true });
  const file = new File(dir, `${runId}.jsonl`);
  file.create({ overwrite: false });

  let buffer: string[] = [];
  let lines = 0;

  const flush = () => {
    if (buffer.length === 0) return;
    const pending = buffer;
    buffer = [];
    try {
      file.write(`${pending.join('\n')}\n`, { append: true });
    } catch (err) {
      // Không nuốt lỗi: một log thiếu dòng mà trông như đủ sẽ cho ra số liệu sai. Giữ lại dòng
      // chưa ghi để lần xả sau thử lại, và báo lên màn hình để người đo biết lượt này có vấn đề.
      buffer = [...pending, ...buffer];
      onWriteError(err);
    }
  };
  const timer = setInterval(flush, FLUSH_INTERVAL_MS);

  return {
    uri: file.uri,
    append(event) {
      buffer.push(JSON.stringify(event));
      lines += 1;
    },
    flush,
    close() {
      clearInterval(timer);
      flush();
    },
    lineCount: () => lines,
  };
}
