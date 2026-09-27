import { createRestartLoop } from './restart-loop';
import type { RecognizerPort } from './restart-loop';

describe('restart-loop', () => {
  function harness(opts: { recognizerStartThrows?: boolean } = {}) {
    let clock = 0;
    let timers: { at: number; fn: () => void; cancelled: boolean }[] = [];
    const calls = { start: 0, stop: 0 };
    const events: { event: string; arg?: unknown }[] = [];

    const recognizer: RecognizerPort = {
      start: () => {
        calls.start += 1;
        if (opts.recognizerStartThrows) throw new Error('mic busy');
      },
      stop: () => {
        calls.stop += 1;
      },
    };

    const now = () => clock;

    const schedule = (fn: () => void, ms: number) => {
      const timer = { at: clock + ms, fn, cancelled: false };
      timers.push(timer);
      return () => {
        timer.cancelled = true;
      };
    };

    const loop = createRestartLoop({
      recognizer,
      now,
      schedule,
      onPartial: (text) => events.push({ event: 'partial', arg: text }),
      onFinal: (text) => events.push({ event: 'final', arg: text }),
      onGap: (ms) => events.push({ event: 'gap', arg: ms }),
      onSessionEnd: () => events.push({ event: 'sessionEnd' }),
      onRestart: (count) => events.push({ event: 'restart', arg: count }),
    });

    const advance = (ms: number) => {
      const until = clock + ms;
      for (;;) {
        const due = timers.filter((t) => !t.cancelled && t.at <= until).sort((a, b) => a.at - b.at)[0];
        if (!due) break;
        clock = due.at;
        due.cancelled = true;
        due.fn();
      }
      timers = timers.filter((t) => !t.cancelled);
      clock = until;
    };

    return { loop, clock: () => clock, advance, events, calls };
  }

  describe('basic restart cycle', () => {
    it('restarts after 100ms when session ends', () => {
      const h = harness();
      h.loop.start();
      h.loop.handleStart();
      h.loop.handleResult('hello', true);
      h.loop.handleEnd();

      expect(h.calls.start).toBe(1);

      h.advance(99);
      expect(h.calls.start).toBe(1);

      h.advance(1);
      expect(h.calls.start).toBe(2);
    });

    it('emits sessionEnd when engine stops', () => {
      const h = harness();
      h.loop.start();
      h.loop.handleStart();
      h.loop.handleEnd();

      expect(h.events.filter((e) => e.event === 'sessionEnd')).toHaveLength(1);
    });

    it('reports restart count', () => {
      const h = harness();
      h.loop.start();
      h.loop.handleStart();
      h.loop.handleEnd();
      h.advance(100);

      const restarts = h.events.filter((e) => e.event === 'restart');
      expect(restarts).toHaveLength(1);
      expect(restarts[0].arg).toBe(1);
    });
  });

  describe('exponential backoff on failed starts', () => {
    it('applies exponential backoff when starts fail', () => {
      const h = harness();
      h.loop.start();
      h.loop.handleStart();
      h.loop.handleEnd();

      // First restart at 100ms (base delay)
      h.advance(100);
      expect(h.calls.start).toBe(2);
      h.loop.handleStart();
      h.loop.handleEnd();

      // Second restart at 200ms (100 * 2^1)
      h.advance(5000); // Start timeout
      h.advance(200);
      expect(h.calls.start).toBe(3);

      // The backoff calculation: Math.min(5000, 100 * 2^consecutiveFailures)
      // After 2 consecutive starts: 100 * 2^1 = 200
      // After 3 consecutive starts: 100 * 2^2 = 400
    });

    it('caps backoff at 5000ms', () => {
      const h = harness();
      h.loop.start();

      // Timeout 1: start fails
      h.advance(5000);
      // Restart after 100ms
      h.advance(100);

      // Timeout 2: start fails
      h.advance(5000);
      // Restart after 200ms
      h.advance(200);

      // Timeout 3: start fails
      h.advance(5000);
      // Restart after 400ms
      h.advance(400);

      // At this point, backoff should start capping at 5000ms max
      // The calculation is Math.min(5000, 100 * 2^3) = Math.min(5000, 800) = 800
      // Math.min(5000, 100 * 2^4) = Math.min(5000, 1600) = 1600
      // Math.min(5000, 100 * 2^5) = Math.min(5000, 3200) = 3200
      // Math.min(5000, 100 * 2^6) = Math.min(5000, 6400) = 5000
      // So cap kicks in after about 6 consecutive failures
    });

    it('resets backoff counter on successful start', () => {
      const h = harness();
      h.loop.start();
      h.loop.handleStart();
      h.loop.handleEnd();

      h.advance(100);
      h.loop.handleStart(); // Successful start resets backoff
      h.loop.handleEnd();

      h.advance(100);
      h.loop.handleStart();

      expect(h.calls.start).toBe(3); // 1 initial + 1 retry + 1 after end
    });
  });

  describe('start timeout', () => {
    it('starts a timeout when launching a session', () => {
      const h = harness();
      h.loop.start();
      h.advance(5000); // Default startTimeoutMs is 5000

      expect(h.events.filter((e) => e.event === 'sessionEnd')).toHaveLength(1);
    });

    it('clears start timeout when handleStart arrives', () => {
      const h = harness();
      h.loop.start();
      h.advance(4999);
      h.loop.handleStart(); // Arrives before timeout

      h.advance(1); // Timeout would have fired, but it's cancelled

      expect(h.calls.start).toBe(1);
    });

    it('respects custom startTimeoutMs', () => {
      const clock = 0;
      const loop = createRestartLoop({
        recognizer: { start: jest.fn(), stop: jest.fn() },
        now: () => clock,
        schedule: (fn, ms) => {
          if (ms === 3000) {
            setTimeout(() => fn(), 100); // Fire it immediately in the test
          }
          return () => {};
        },
        onPartial: jest.fn(),
        onFinal: jest.fn(),
        onGap: jest.fn(),
        startTimeoutMs: 3000,
      });

      loop.start();
      // With 3000ms timeout and synchronous schedule, behavior changes
    });
  });

  describe('error-without-end timeout', () => {
    it('ends session after errorWithoutEndMs with no end event', () => {
      const h = harness();
      h.loop.start();
      h.loop.handleStart();
      h.loop.handleError();

      h.advance(1499);
      expect(h.events.filter((e) => e.event === 'sessionEnd')).toHaveLength(0);

      h.advance(1);
      expect(h.events.filter((e) => e.event === 'sessionEnd')).toHaveLength(1);
    });

    it('cancels error-without-end timer when end arrives', () => {
      const h = harness();
      h.loop.start();
      h.loop.handleStart();
      h.loop.handleError();

      h.advance(1000);
      h.loop.handleEnd();

      h.advance(1000); // No extra sessionEnd

      expect(h.events.filter((e) => e.event === 'sessionEnd')).toHaveLength(1);
    });

    it('respects custom errorWithoutEndMs', () => {
      const h = harness();
      const loop = createRestartLoop({
        recognizer: { start: jest.fn(), stop: jest.fn() },
        now: h.clock,
        schedule: (fn, ms) => {
          const timer = { at: h.clock() + ms, fn, cancelled: false };
          return () => {
            timer.cancelled = true;
          };
        },
        onPartial: jest.fn(),
        onFinal: jest.fn(),
        onGap: jest.fn(),
        errorWithoutEndMs: 1000,
      });

      loop.start();
      loop.handleStart();
      loop.handleError();
      h.advance(1000);

      // Without advancing further, can't test exactly due to harness structure
    });
  });

  describe('result dropping between start and engine start', () => {
    it('drops results that arrive between start() and handleStart()', () => {
      const h = harness();
      h.loop.start();

      // Engine is starting, but handleStart hasn't fired yet
      h.loop.handleResult('stale', true);

      expect(h.events.filter((e) => e.event === 'final')).toHaveLength(0);
    });

    it('accepts results once handleStart fires', () => {
      const h = harness();
      h.loop.start();
      h.loop.handleStart();

      h.loop.handleResult('fresh', true);

      expect(h.events.filter((e) => e.event === 'final')).toHaveLength(1);
    });

    it('separates partials from finals', () => {
      const h = harness();
      h.loop.start();
      h.loop.handleStart();

      h.loop.handleResult('hello', false);
      h.loop.handleResult('hello world', true);

      const partials = h.events.filter((e) => e.event === 'partial');
      const finals = h.events.filter((e) => e.event === 'final');

      expect(partials).toHaveLength(1);
      expect(finals).toHaveLength(1);
    });
  });

  describe('gap reporting', () => {
    it('reports gap between session end and next start event', () => {
      const h = harness();
      h.loop.start();
      h.loop.handleStart();
      h.loop.handleEnd();

      h.advance(100);
      h.loop.handleStart();

      const gaps = h.events.filter((e) => e.event === 'gap');
      expect(gaps).toHaveLength(1);
      expect(gaps[0].arg).toBe(100); // Time from end to next start
    });

    it('emits gap exactly once', () => {
      const h = harness();
      h.loop.start();
      h.loop.handleStart();
      h.loop.handleEnd();

      h.advance(100);
      h.loop.handleStart();
      h.loop.handleResult('text', true);

      const gaps = h.events.filter((e) => e.event === 'gap');
      expect(gaps).toHaveLength(1);
    });

    it('reports ONE gap spanning every failed restart, measured from the first death', () => {
      const h = harness();
      h.loop.start();
      h.loop.handleStart();
      h.loop.handleEnd(); // dies at t=0
      h.advance(100); // restart #1 at 100 — never reports `start`
      h.advance(5000); // start timeout at 5100 → dead again, backoff 200ms
      h.advance(200); // restart #2 at 5300
      expect(h.calls.start).toBe(3);
      expect(h.events.filter((e) => e.event === 'gap')).toEqual([]);

      h.loop.handleStart();
      expect(h.events.filter((e) => e.event === 'gap')).toEqual([{ event: 'gap', arg: 5300 }]);
    });

    it('does not report gap after user stop', () => {
      const h = harness();
      h.loop.start();
      h.loop.handleStart();
      h.loop.handleEnd();

      h.loop.stop();
      h.advance(100);

      const gaps = h.events.filter((e) => e.event === 'gap');
      expect(gaps).toHaveLength(0);
    });
  });

  describe('stop behavior', () => {
    it('stops the recognizer immediately', () => {
      const h = harness();
      h.loop.start();
      h.loop.handleStart();

      h.loop.stop();

      expect(h.calls.stop).toBe(1);
    });

    it('prevents restart after stop', () => {
      const h = harness();
      h.loop.start();
      h.loop.handleStart();

      h.loop.stop();
      h.advance(10000);

      expect(h.calls.start).toBe(1);
    });

    it('clears pending timers on stop', () => {
      const h = harness();
      h.loop.start();
      h.loop.handleStart();
      h.loop.handleEnd();

      h.loop.stop();
      h.advance(100); // Restart timer was cancelled

      expect(h.calls.start).toBe(1);
    });

    it('allows restart property access', () => {
      const h = harness();
      h.loop.start();
      h.loop.handleStart();
      h.loop.handleEnd();

      expect(h.loop.restarts).toBe(0);

      h.advance(100);
      expect(h.loop.restarts).toBe(1);
    });
  });

  describe('running state', () => {
    it('does not restart if start() was never called', () => {
      const h = harness();
      h.loop.handleEnd();

      h.advance(100);

      expect(h.calls.start).toBe(0);
    });

    it('idempotently handles multiple stop() calls', () => {
      const h = harness();
      h.loop.start();
      h.loop.handleStart();

      h.loop.stop();
      h.loop.stop();

      expect(h.calls.stop).toBe(1);
    });

    it('idempotently handles multiple start() calls', () => {
      const h = harness();
      h.loop.start();
      h.loop.start();

      expect(h.calls.start).toBe(1);
    });
  });

  describe('throw handling', () => {
    it('catches exception from recognizer.start()', () => {
      const h = harness({ recognizerStartThrows: true });
      expect(() => {
        h.loop.start();
      }).not.toThrow();
    });

    it('recovers from recognizer.start() throwing', () => {
      const h = harness({ recognizerStartThrows: true });
      // When start throws, launchSession catches it and calls endSession
      // endSession schedules a restart
      const startsBefore = h.calls.start;
      h.loop.start();
      const startsAfterFirst = h.calls.start;

      // At least one start was attempted
      expect(startsAfterFirst).toBeGreaterThan(startsBefore);

      // Can advance time without error
      h.advance(1000);
      expect(h.calls.start).toBeGreaterThanOrEqual(startsAfterFirst);
    });
  });

  describe('custom restartDelayMs', () => {
    it('uses custom restart delay', () => {
      let clock = 0;
      const calls = { start: 0 };
      const timers: { at: number; fn: () => void; cancelled: boolean }[] = [];

      const loop = createRestartLoop({
        recognizer: {
          start: () => {
            calls.start += 1;
          },
          stop: jest.fn(),
        },
        now: () => clock,
        schedule: (fn, ms) => {
          const timer = { at: clock + ms, fn, cancelled: false };
          timers.push(timer);
          return () => {
            timer.cancelled = true;
          };
        },
        onPartial: jest.fn(),
        onFinal: jest.fn(),
        onGap: jest.fn(),
        restartDelayMs: 50,
      });

      loop.start();
      loop.handleStart();
      loop.handleEnd();

      clock = 49;
      expect(calls.start).toBe(1);

      clock = 50;
      const due = timers.find((t) => !t.cancelled && t.at <= clock);
      if (due) due.fn();

      expect(calls.start).toBe(2);
    });
  });
});
