#!/usr/bin/env node
// Phân tích một hoặc nhiều file log của app spike so với bản chép tay đối chiếu.
//
//   node analysis/analyze-run.mjs --reference fixtures/reference.txt runs/*.jsonl
//   node analysis/analyze-run.mjs --reference fixtures/reference.txt --format md runs/*.jsonl >> REPORT.md
//
// --format text (mặc định) | json | md (một dòng bảng Markdown mỗi lượt, khớp bảng trong REPORT.md)

import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { parseArgs } from 'node:util';
import { parseLog } from './parse-session-log.mjs';
import { parseReferenceLines, timeReferenceWords } from './reference-transcript.mjs';
import { computeRunMetrics } from './run-metrics.mjs';

const MD_HEADER = [
  '| Log | Máy | OS | Engine | Trạng thái app | Cách thu | Khoảng cách | Phút chạy | Phiên dài nhất (phút) | Restart | Không hồi phục | Khoảng điếc trung vị (ms) | Restart ≤500ms | Chữ mất/restart (TB) | % chữ mất do restart | Chữ nhận ra khi chạy nền | WER |',
  '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|',
].join('\n');

const fmt = (value, digits = 1) =>
  value === null || value === undefined ? '—' : Number(value).toFixed(digits);
const pct = (value) =>
  value === null || value === undefined ? '—' : `${(value * 100).toFixed(1)}%`;

/** @param {string} file @param {ReturnType<typeof computeRunMetrics>} m */
function toMarkdownRow(file, m) {
  const meta = m.meta ?? {};
  return `| ${basename(file)} | ${meta.device ?? '?'} | ${meta.os ?? '?'} | ${meta.engine ?? '?'} | ${meta.app_state ?? '?'} | ${meta.placement ?? '?'} | ${meta.distance_cm ?? '?'}cm | ${fmt(m.runMinutes)} | ${fmt(m.longestSessionMinutes)} | ${m.restarts} | ${m.unrecoveredStops} | ${fmt(m.gapMs.median, 0)} | ${pct(m.restartsWithin500msShare)} | ${fmt(m.wordsLost.perRestartMean)} | ${pct(m.wordsLost.shareOfReference)} | ${m.background.finalWords} | ${pct(m.wer?.wer ?? null)} |`;
}

/** @param {string} file @param {ReturnType<typeof computeRunMetrics>} m */
function toText(file, m) {
  const warn = m.playbackMarked
    ? ''
    : '\n  ⚠ Log không có mốc mark_playback → không tính được chữ mất theo restart.';
  return [
    `== ${basename(file)} (${m.meta?.device ?? '?'} · ${m.meta?.engine ?? '?'} · ${m.meta?.app_state ?? '?'})${warn}`,
    `  Chạy ${fmt(m.runMinutes)} phút · ${m.sessions} phiên · ${m.restarts} restart · ${m.unrecoveredStops} lần dừng không hồi phục`,
    `  Phiên dài nhất ${fmt(m.longestSessionMinutes)} phút · trung vị ${fmt(m.medianSessionSeconds)} giây`,
    `  Khoảng điếc: trung vị ${fmt(m.gapMs.median, 0)}ms · p95 ${fmt(m.gapMs.p95, 0)}ms · max ${fmt(m.gapMs.max, 0)}ms · ${pct(m.restartsWithin500msShare)} restart trong 500ms (AC US-11)`,
    `  Chữ mất do restart: ${m.wordsLost.total ?? '—'} (TB ${fmt(m.wordsLost.perRestartMean)}/restart, max ${m.wordsLost.perRestartMax ?? '—'}) = ${pct(m.wordsLost.shareOfReference)} bản chép tay`,
    `  Chạy nền: ${fmt(m.background.backgroundMs / 60000)} phút · ${m.background.restartsStarted}/${m.background.restartAttempts} restart thành công · ${m.background.finalWords} chữ nhận ra · heartbeat hụt dài nhất ${fmt(m.maxHeartbeatGapSeconds, 0)}s`,
    `  Lỗi: ${
      Object.entries(m.errorCodes)
        .map(([code, n]) => `${code}×${n}`)
        .join(', ') || 'không có'
    }`,
    m.wer
      ? `  WER ${pct(m.wer.wer)} (S ${m.wer.substitutions} · D ${m.wer.deletions} · I ${m.wer.insertions} / N ${m.wer.referenceWords})`
      : '  WER: — (bản chép tay rỗng)',
  ].join('\n');
}

function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      reference: { type: 'string', short: 'r' },
      format: { type: 'string', short: 'f', default: 'text' },
    },
  });
  if (!values.reference || positionals.length === 0) {
    console.error(
      'Cách dùng: analyze-run.mjs --reference <bản-chép-tay.txt> [--format text|json|md] <log.jsonl>...',
    );
    process.exit(2);
  }
  if (!['text', 'json', 'md'].includes(values.format)) {
    console.error(`--format không hợp lệ: ${values.format}`);
    process.exit(2);
  }

  const referenceWords = timeReferenceWords(
    parseReferenceLines(readFileSync(values.reference, 'utf8')),
  );
  const results = positionals.map((file) => ({
    file,
    metrics: computeRunMetrics(parseLog(readFileSync(file, 'utf8')), referenceWords),
  }));

  if (values.format === 'json') console.log(JSON.stringify(results, null, 2));
  if (values.format === 'md')
    console.log([MD_HEADER, ...results.map((r) => toMarkdownRow(r.file, r.metrics))].join('\n'));
  if (values.format === 'text')
    console.log(results.map((r) => toText(r.file, r.metrics)).join('\n\n'));
}

main();
