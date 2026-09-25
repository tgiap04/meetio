import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRecognitionController } from '../recognition-controller.ts';

import type { LogEvent } from '../log-event.ts';

// Reuse harness from main test
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

test('late result from old session before the new session starts is dropped', () => {
  const h = harness();
  h.controller.start();
  h.controller.handleStart(); // s1 start
  h.controller.handleResult('s1 text', true);
  h.controller.handleEnd();
  h.advance(100); // restart timer fires, s2 starts, sessionEnded = false

  // Before s2's start() event arrives, a late final() for s1 is received
  // Native events carry no session id; anything before s2's `start` belongs to s1
  h.controller.handleResult('old s1 text', true);

  const finalEvents = h.events.filter((e) => e.event === 'final');
  assert.ok(
    !finalEvents.some((e) => e.session_id === 's2'),
    'late final from old session must not be logged to new session',
  );
  h.controller.handleStart();
  h.controller.handleResult('s2 text', true);
  assert.equal(h.events.filter((e) => e.event === 'final' && e.session_id === 's2').length, 1);
});

test('double handleEnd() is idempotent', () => {
  const h = harness();
  h.controller.start();
  h.controller.handleStart();
  h.controller.handleEnd();

  const afterFirst = h.events.length;
  h.controller.handleEnd(); // Second call

  // Should not add any new events
  assert.equal(h.events.length, afterFirst, 'second handleEnd should not add events');
  assert.equal(
    h.events.filter((e) => e.event === 'auto_stop').length,
    1,
    'should only have one auto_stop',
  );
});

test('stop() called during pending restart timer cancels restart', () => {
  const h = harness();
  h.controller.start();
  h.controller.handleStart();
  h.controller.handleEnd();

  // At t=50ms, restart is scheduled for t=100ms
  h.advance(50);

  // Now call stop() before restart fires
  h.controller.stop();

  // Advance past the restart timer
  h.advance(100);

  // Should not have called start() a second time
  assert.equal(h.calls.start, 1, 'stop() should cancel pending restart');

  // Should have run_stop logged
  const hasRunStop = h.events.some((e) => e.event === 'run_stop');
  assert.ok(hasRunStop, 'should log run_stop');
});

test('handleResult after session ended is ignored', () => {
  const h = harness();
  h.controller.start();
  h.controller.handleStart();
  h.controller.handleEnd();

  const eventCount = h.events.length;
  h.controller.handleResult('late', true);
  h.controller.handleResult('very late', false);

  assert.equal(h.events.length, eventCount, 'result after session end should not be logged');
});

test('handleError then immediate stop logs user_stop not auto_stop', () => {
  // handleError schedules an error-without-end timer.
  // If stop() is called before that timer fires, it cancels the timer
  // and logs user_stop instead of auto_stop.
  const h = harness();
  h.controller.start();
  h.controller.handleStart();
  h.controller.handleError('network', 'offline');

  // Stop before the 1.5s error-without-end timer fires
  h.controller.stop();
  h.advance(2000);

  // Should not restart after stop
  assert.equal(h.calls.start, 1);

  // Should have user_stop, not auto_stop (timer was cancelled)
  const autoStops = h.events.filter((e) => e.event === 'auto_stop');
  const userStops = h.events.filter((e) => e.event === 'user_stop');
  assert.equal(autoStops.length, 0, 'should have no auto_stop (timer was cancelled)');
  assert.equal(userStops.length, 1, 'should have one user_stop');
});

test('multiple partial events in one session are all captured', () => {
  const h = harness();
  h.controller.start();
  h.controller.handleStart();
  h.controller.handleResult('partial one', false);
  h.controller.handleResult('partial two', false);
  h.controller.handleResult('final result', true);
  h.controller.handleEnd();

  const partials = h.events.filter((e) => e.event === 'partial');
  assert.equal(partials.length, 2, 'should log both partial results');
  assert.equal(partials[0].text, 'partial one');
  assert.equal(partials[1].text, 'partial two');
});

test('restart delay exponential backoff caps at 5000ms', () => {
  // Simulate repeated failures: start → timeout → restart → timeout → restart → ...
  const h = harness();
  h.controller.start();

  // Fail 1: timeout at 5s, schedule restart at 100ms
  h.advance(5000);
  h.advance(100);
  assert.equal(h.calls.start, 2);

  // Fail 2: timeout at 5s, schedule restart at 200ms
  h.advance(5000);
  h.advance(200);
  assert.equal(h.calls.start, 3);

  // Fail 3: timeout at 5s, schedule restart at 400ms
  h.advance(5000);
  h.advance(400);
  assert.equal(h.calls.start, 4);

  // Fail 4: timeout at 5s, schedule restart at 800ms
  h.advance(5000);
  h.advance(800);
  assert.equal(h.calls.start, 5);

  // Fail 5: timeout at 5s, schedule restart at 1600ms
  h.advance(5000);
  h.advance(1600);
  assert.equal(h.calls.start, 6);

  // Fail 6: timeout at 5s, schedule restart at 3200ms
  h.advance(5000);
  h.advance(3200);
  assert.equal(h.calls.start, 7);

  // Fail 7: timeout at 5s, schedule restart at 5000ms (capped)
  h.advance(5000);
  h.advance(5000);
  assert.equal(h.calls.start, 8);

  // Fail 8+: all at 5000ms cap
  h.advance(5000);
  h.advance(5000);
  assert.equal(h.calls.start, 9);
});
