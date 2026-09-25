import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSessions, mergeRecognizedText, parseLog } from '../parse-session-log.mjs';
import { parseReferenceLines, timeReferenceWords } from '../reference-transcript.mjs';
import { computeRunMetrics } from '../run-metrics.mjs';

const T0 = 1_700_000_000_000;
const ev = (offsetMs, event, extra = {}) => ({ event, timestamp: T0 + offsetMs, ...extra });
const toJsonl = (events) => events.map((e) => JSON.stringify(e)).join('\n');

test('gộp kết quả: nối câu riêng rẽ, thay thế chuỗi cộng dồn', () => {
  assert.equal(mergeRecognizedText('xin chào', 'mọi người'), 'xin chào mọi người');
  assert.equal(mergeRecognizedText('xin chào', 'xin chào mọi người'), 'xin chào mọi người');
  assert.equal(mergeRecognizedText('xin chào', '  '), 'xin chào');
});

test('bỏ qua dòng cuối cụt do app bị giết, nhưng báo lỗi dòng hỏng ở giữa', () => {
  const good = JSON.stringify(ev(0, 'start', { session_id: 's1' }));
  assert.equal(parseLog(`${good}\n{"event":"fin`).length, 1);
  assert.throws(() => parseLog(`{"event":\n${good}`), /Dòng 1/);
});

test('partial còn treo lúc phiên chết vẫn được tính là đã nhận ra', () => {
  const { sessions } = buildSessions([
    ev(0, 'start', { session_id: 's1' }),
    ev(100, 'final', { session_id: 's1', text: 'một hai' }),
    ev(200, 'partial', { session_id: 's1', text: 'ba' }),
    ev(300, 'error', { session_id: 's1', error: 'network' }),
    ev(310, 'auto_stop', { session_id: 's1' }),
  ]);
  assert.equal(sessions[0].text, 'một hai ba');
  assert.equal(sessions[0].endReason, 'error');
});

test('đếm chữ nói ra đúng lúc điếc giữa hai phiên và khoảng điếc', () => {
  // 10 từ, mỗi giây một từ, audio bắt đầu tại T0 + 1000
  const reference = timeReferenceWords(
    parseReferenceLines('[00:00] a b c d e f g h i j\n[00:10] k'),
  );
  const events = [
    ev(0, 'run_meta', { device: 'Pixel 7', engine: 'on-device', app_state: 'foreground' }),
    ev(500, 'start', { session_id: 's1' }),
    ev(1000, 'mark_playback'),
    ev(4000, 'final', { session_id: 's1', text: 'a b c' }),
    ev(4200, 'auto_stop', { session_id: 's1' }), // điếc từ 3.2s audio
    ev(4700, 'restart', { session_id: 's2' }),
    ev(6100, 'start', { session_id: 's2' }), // nghe lại từ 5.1s audio
    ev(11500, 'final', { session_id: 's2', text: 'g h i j k' }),
    ev(12000, 'user_stop', { session_id: 's2' }),
    ev(12000, 'run_stop'),
  ];
  const m = computeRunMetrics(parseLog(toJsonl(events)), reference);
  assert.equal(m.restarts, 1);
  assert.equal(m.unrecoveredStops, 0);
  assert.equal(m.gapMs.median, 1900);
  assert.equal(m.restartsWithin500msShare, 0);
  // Khoảng điếc [3.2s, 5.1s) audio chứa e (4s) và f (5s)
  assert.equal(m.wordsLost.total, 2);
  assert.equal(m.wordsLost.perRestartMean, 2);
  // hypothesis thiếu d, e, f → 3 lỗi xoá trên 11 từ
  assert.equal(m.wer.deletions, 3);
  assert.equal(m.meta.device, 'Pixel 7');
});

test('phiên chết mà không bao giờ bật lại được thì tính là dừng không hồi phục', () => {
  const events = [
    ev(0, 'start', { session_id: 's1' }),
    ev(1000, 'app_background'),
    ev(2000, 'error', { session_id: 's1', error: 'audio-capture' }),
    ev(2010, 'auto_stop', { session_id: 's1' }),
    ev(2500, 'restart', { session_id: 's2' }),
    ev(9000, 'run_stop'),
  ];
  const m = computeRunMetrics(parseLog(toJsonl(events)), []);
  assert.equal(m.unrecoveredStops, 1);
  assert.equal(m.restartsWithin500msShare, 0);
  assert.deepEqual(m.errorCodes, { 'audio-capture': 1 });
  assert.equal(m.background.restartAttempts, 1);
  assert.equal(m.background.restartsStarted, 0);
  assert.equal(m.background.backgroundMs, 8000);
  assert.equal(m.maxHeartbeatGapSeconds, null);
  assert.equal(m.wer, null);
});

test('không có mốc phát audio thì không bịa ra số chữ mất', () => {
  const events = [
    ev(0, 'start', { session_id: 's1' }),
    ev(1000, 'auto_stop', { session_id: 's1' }),
    ev(1500, 'start', { session_id: 's2' }),
  ];
  const m = computeRunMetrics(
    parseLog(toJsonl(events)),
    timeReferenceWords(parseReferenceLines('[00:00] a')),
  );
  assert.equal(m.playbackMarked, false);
  assert.equal(m.wordsLost.total, null);
  assert.equal(m.wordsLost.shareOfReference, null);
});

test('khoảng hụt heartbeat dài nhất lộ ra lúc app bị treo', () => {
  const events = [0, 30_000, 60_000, 250_000, 280_000].map((t) => ev(t, 'heartbeat'));
  const m = computeRunMetrics(parseLog(toJsonl(events)), []);
  assert.equal(m.maxHeartbeatGapSeconds, 190);
});
