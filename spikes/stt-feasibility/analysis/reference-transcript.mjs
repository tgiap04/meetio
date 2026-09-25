// Bản chép tay đối chiếu: mỗi dòng một mốc thời gian tính từ đầu file âm thanh.
//   [00:01:05] nội dung câu nói
//   [01:05] cũng được chấp nhận
// Không ghi tên người nói — hệ thống không dùng tới (US-13 đã bỏ).
// Dòng trống và dòng bắt đầu bằng `#` bị bỏ qua.

import { toWords } from './normalize-vietnamese-text.mjs';

const LINE = /^\[(?:(\d+):)?(\d{1,2}):(\d{2}(?:\.\d+)?)\]\s*(.*)$/;

/** @typedef {{ word: string, atMs: number }} TimedWord */

/** @param {string} content @returns {{ startMs: number, text: string }[]} */
export function parseReferenceLines(content) {
  const lines = [];
  content.split('\n').forEach((raw, index) => {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) return;
    const match = LINE.exec(line);
    if (!match) throw new Error(`Dòng ${index + 1} thiếu mốc [mm:ss]: ${line.slice(0, 80)}`);
    const [, h, m, s, text] = match;
    const startMs = ((Number(h ?? 0) * 60 + Number(m)) * 60 + Number(s)) * 1000;
    if (lines.length > 0 && startMs < lines[lines.length - 1].startMs) {
      throw new Error(`Dòng ${index + 1} có mốc thời gian lùi so với dòng trước`);
    }
    lines.push({ startMs, text });
  });
  return lines;
}

// Không có mốc cho từng từ, nên rải đều các từ của một dòng trong khoảng tới dòng kế tiếp.
// Dòng cuối không có dòng kế tiếp → dùng tốc độ nói trung bình của cả bản chép tay.
/** @param {{ startMs: number, text: string }[]} lines @returns {TimedWord[]} */
export function timeReferenceWords(lines) {
  const perLine = lines.map((l) => toWords(l.text));
  const spannedMs = lines.length > 1 ? lines[lines.length - 1].startMs - lines[0].startMs : 0;
  const spannedWords = perLine.slice(0, -1).reduce((sum, w) => sum + w.length, 0);
  const fallbackMsPerWord = spannedWords > 0 ? spannedMs / spannedWords : 400;

  return lines.flatMap((line, i) => {
    const words = perLine[i];
    const next = lines[i + 1];
    const msPerWord =
      next && words.length > 0 ? (next.startMs - line.startMs) / words.length : fallbackMsPerWord;
    return words.map((word, k) => ({ word, atMs: line.startMs + k * msPerWord }));
  });
}
