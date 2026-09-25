import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRecognitionController } from '../recognition-controller.ts';
import type { LogEvent } from '../log-event.ts';

// Đồng hồ giả: hẹn giờ chỉ chạy khi test gọi advance().
function harness(opts: { startThrows?: boolean } = {}) {
  let clock = 0;
  let timers: { at: number; fn: () => void; cancelled: boolean }[] = [];
  const events: LogEvent[] = [];
  const calls = { start: 0, stop: 0 };
  const controller = createRecognitionController({
    recognizer: {
      start: () => {
        calls.start += 1;
        if (opts.startThrows) throw new Error('mic busy');
      },
      stop: () => {
        calls.stop += 1;
      },
    },
    log: (e) => events.push(e),
    now: () => clock,
    schedule: (fn, ms) => {
      const timer = { at: clock + ms, fn, cancelled: false };
      timers.push(timer);
      return () => {
        timer.cancelled = true;
      };
    },
  });
  const advance = (ms: number) => {
    const until = clock + ms;
    for (;;) {
      const due = timers
        .filter((t) => !t.cancelled && t.at <= until)
        .sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      clock = due.at;
      due.cancelled = true;
      due.fn();
    }
    timers = timers.filter((t) => !t.cancelled);
    clock = until;
  };
  const names = () => events.map((e) => `${e.event}${e.session_id ? `:${e.session_id}` : ''}`);
  return { controller, events, calls, advance, names };
}

test('tự ngắt → ghi auto_stop, bật lại sau 100ms với session mới', () => {
  const h = harness();
  h.controller.start();
  h.controller.handleStart();
  h.controller.handleResult('xin chào', true);
  h.controller.handleEnd();
  h.advance(99);
  assert.equal(h.calls.start, 1);
  h.advance(1);
  assert.equal(h.calls.start, 2);
  h.controller.handleStart();
  assert.deepEqual(h.names(), ['start:s1', 'final:s1', 'auto_stop:s1', 'restart:s2', 'start:s2']);
  assert.equal(h.events.find((e) => e.event === 'restart')?.timestamp, 100);
});

test('lỗi rồi end: chỉ bật lại một lần', () => {
  const h = harness();
  h.controller.start();
  h.controller.handleStart();
  h.controller.handleError('no-speech', 'No speech');
  h.controller.handleEnd();
  h.advance(5000);
  assert.equal(h.calls.start, 2);
  assert.deepEqual(h.names().slice(0, 4), ['start:s1', 'error:s1', 'auto_stop:s1', 'restart:s2']);
});

test('lỗi mà end không bao giờ tới → sau 1,5s vẫn coi là chết và bật lại', () => {
  const h = harness();
  h.controller.start();
  h.controller.handleStart();
  h.controller.handleError('network', 'offline');
  h.advance(1500);
  assert.ok(h.events.some((e) => e.error === 'error-without-end'));
  h.advance(100);
  assert.equal(h.calls.start, 2);
});

test('start() không bao giờ báo start → hết giờ, bật lại với nhịp giãn dần tới 5s', () => {
  const h = harness();
  h.controller.start();
  h.advance(5000); // hết giờ chờ lần 1 → hẹn bật lại sau 100ms
  h.advance(100);
  assert.equal(h.calls.start, 2);
  h.advance(5000); // hết giờ lần 2 → lần này chờ 200ms
  h.advance(199);
  assert.equal(h.calls.start, 2);
  h.advance(1);
  assert.equal(h.calls.start, 3);
  assert.ok(h.events.filter((e) => e.error === 'start-timeout').length >= 2);
});

test('recognizer.start ném lỗi thì ghi lại và vẫn thử lại', () => {
  const h = harness({ startThrows: true });
  h.controller.start();
  assert.ok(h.events.some((e) => String(e.error).startsWith('start-threw: mic busy')));
  h.advance(100);
  assert.equal(h.calls.start, 2);
});

test('người đo dừng: user_stop + run_stop, không bật lại, bỏ qua sự kiện đến muộn', () => {
  const h = harness();
  h.controller.start();
  h.controller.handleStart();
  h.controller.stop();
  h.controller.handleResult('muộn', true);
  h.controller.handleEnd();
  h.advance(10000);
  assert.equal(h.calls.start, 1);
  assert.equal(h.calls.stop, 1);
  assert.deepEqual(h.names(), ['start:s1', 'user_stop:s1', 'run_stop:s1']);
});

test('mark_playback không gắn với phiên nào', () => {
  const h = harness();
  h.controller.start();
  h.controller.markPlayback();
  assert.deepEqual(h.events.at(-1), { event: 'mark_playback', timestamp: 0 });
});
