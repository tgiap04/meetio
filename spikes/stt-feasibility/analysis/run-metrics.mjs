// Tính các con số REPORT.md cần cho một lượt đo: phiên dài nhất, số lần khởi động lại,
// khoảng "điếc" giữa hai phiên, số chữ bị nói ra đúng lúc điếc, sống sót khi chạy nền, WER.

import { buildSessions } from './parse-session-log.mjs';
import { toWords } from './normalize-vietnamese-text.mjs';
import { wordErrorRate } from './word-error-rate.mjs';

/** @param {number[]} values @param {number} q */
function quantile(values, q) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
}

/** @param {number[]} timestamps */
function maxGap(timestamps) {
  if (timestamps.length < 2) return null;
  let max = 0;
  for (let i = 1; i < timestamps.length; i += 1)
    max = Math.max(max, timestamps[i] - timestamps[i - 1]);
  return max / 1000;
}

/** @param {import('./parse-session-log.mjs').LogEvent[]} events */
function backgroundStats(events) {
  let since = null;
  const stats = {
    backgroundMs: 0,
    restartAttempts: 0,
    restartsStarted: 0,
    finalWords: 0,
    errors: 0,
  };
  for (const e of events) {
    if (e.event === 'app_background' && since === null) since = e.timestamp;
    if (e.event === 'app_foreground' && since !== null) {
      stats.backgroundMs += e.timestamp - since;
      since = null;
    }
    if (since === null) continue;
    if (e.event === 'restart') stats.restartAttempts += 1;
    if (e.event === 'start') stats.restartsStarted += 1;
    if (e.event === 'final') stats.finalWords += toWords(e.text ?? '').length;
    if (e.event === 'error') stats.errors += 1;
  }
  const last = events[events.length - 1];
  if (since !== null && last) stats.backgroundMs += last.timestamp - since;
  return stats;
}

/**
 * @param {import('./parse-session-log.mjs').LogEvent[]} events
 * @param {import('./reference-transcript.mjs').TimedWord[]} referenceWords
 */
export function computeRunMetrics(events, referenceWords) {
  const { meta, playbackStartedAt, sessions, runEndedAt } = buildSessions(events);
  const ordered = [...sessions].sort((a, b) => a.startedAt - b.startedAt);
  const lastTimestamp = runEndedAt ?? events[events.length - 1]?.timestamp ?? 0;

  const gaps = [];
  ordered.forEach((s, i) => {
    if (s.endedAt === null || s.endReason === 'user_stop') return;
    const next = ordered[i + 1];
    gaps.push({
      fromMs: s.endedAt,
      toMs: next ? next.startedAt : lastTimestamp,
      recovered: Boolean(next),
      reason: s.endReason,
    });
  });

  // Chữ "rơi" ở một lần khởi động lại = chữ trong bản chép tay được nói ra đúng lúc không phiên nào nghe.
  const wordsInWindow = (fromMs, toMs) =>
    playbackStartedAt === null
      ? null
      : referenceWords.filter(
          (w) => playbackStartedAt + w.atMs >= fromMs && playbackStartedAt + w.atMs < toMs,
        ).length;
  const lostPerGap = gaps.map((g) => wordsInWindow(g.fromMs, g.toMs));
  const measurable = lostPerGap.filter((n) => n !== null);
  const totalLost = measurable.reduce((sum, n) => sum + n, 0);

  const durations = ordered.filter((s) => s.endedAt !== null).map((s) => s.endedAt - s.startedAt);
  const gapDurations = gaps.filter((g) => g.recovered).map((g) => g.toMs - g.fromMs);
  const hypothesis = toWords(ordered.map((s) => s.text).join(' '));
  const reference = referenceWords.map((w) => w.word);

  const errorCodes = {};
  events
    .filter((e) => e.event === 'error')
    .forEach((e) => {
      const code = String(e.error ?? 'unknown');
      errorCodes[code] = (errorCodes[code] ?? 0) + 1;
    });

  return {
    meta: meta ?? null,
    playbackMarked: playbackStartedAt !== null,
    runMinutes: ordered.length ? (lastTimestamp - ordered[0].startedAt) / 60000 : 0,
    sessions: ordered.length,
    // Đếm từ sự kiện `restart` thô: lần khởi động không bao giờ báo `start` không tạo phiên,
    // nhưng vẫn là một lần restart (thất bại) phải hiện trong bảng.
    restarts: events.filter((e) => e.event === 'restart').length,
    unrecoveredStops: gaps.filter((g) => !g.recovered).length,
    longestSessionMinutes: durations.length ? Math.max(...durations) / 60000 : 0,
    medianSessionSeconds: durations.length ? quantile(durations, 0.5) / 1000 : 0,
    gapMs: {
      median: quantile(gapDurations, 0.5),
      p95: quantile(gapDurations, 0.95),
      max: gapDurations.length ? Math.max(...gapDurations) : null,
    },
    // AC US-11: bật lại trong vòng 500ms. Lần dừng không hồi phục tính là trượt.
    restartsWithin500msShare: gaps.length
      ? gaps.filter((g) => g.recovered && g.toMs - g.fromMs <= 500).length / gaps.length
      : null,
    wordsLost: {
      total: playbackStartedAt === null ? null : totalLost,
      perRestartMean: measurable.length ? totalLost / measurable.length : null,
      perRestartMax: measurable.length ? Math.max(...measurable) : null,
      shareOfReference:
        playbackStartedAt === null || reference.length === 0 ? null : totalLost / reference.length,
    },
    errorCodes,
    // Heartbeat ghi mỗi 30s; khoảng trống dài hơn nhiều là lúc app bị treo (thường là iOS chạy nền).
    maxHeartbeatGapSeconds: maxGap(
      events.filter((e) => e.event === 'heartbeat').map((e) => e.timestamp),
    ),
    background: backgroundStats(events),
    wer: reference.length ? wordErrorRate(reference, hypothesis) : null,
  };
}
