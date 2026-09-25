import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseReferenceLines, timeReferenceWords } from '../reference-transcript.mjs';

test('đọc cả mốc [mm:ss] lẫn [hh:mm:ss], bỏ dòng trống và chú thích', () => {
  const lines = parseReferenceLines('# ghi chú\n[00:05] một hai\n\n[1:00:00] ba\n');
  assert.deepEqual(lines, [
    { startMs: 5000, text: 'một hai' },
    { startMs: 3600000, text: 'ba' },
  ]);
});

test('từ chối dòng thiếu mốc và mốc lùi', () => {
  assert.throws(() => parseReferenceLines('không có mốc'), /thiếu mốc/);
  assert.throws(() => parseReferenceLines('[00:10] a\n[00:05] b'), /lùi/);
});

test('rải đều các từ của một dòng tới dòng kế tiếp', () => {
  const words = timeReferenceWords(parseReferenceLines('[00:00] một hai ba bốn\n[00:04] năm'));
  assert.deepEqual(
    words.map((w) => [w.word, w.atMs]),
    [
      ['một', 0],
      ['hai', 1000],
      ['ba', 2000],
      ['bốn', 3000],
      // dòng cuối dùng tốc độ trung bình: 4000ms / 4 từ
      ['năm', 4000],
    ],
  );
});
