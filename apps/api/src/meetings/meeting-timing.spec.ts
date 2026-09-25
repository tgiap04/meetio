import { closePause, openPause, recordedDurationSec } from './meeting-timing.js';

const at = (sec: number) => new Date(Date.UTC(2026, 8, 25, 9, 0, 0) + sec * 1000);

function meeting() {
  return { started_at: at(0), paused_at: null as Date | null, paused_duration_ms: 0 };
}

describe('meeting timing', () => {
  it('counts wall time when never paused', () => {
    expect(recordedDurationSec(meeting(), at(600))).toBe(600);
  });

  it('excludes every closed pause', () => {
    const m = meeting();
    openPause(m, at(100));
    closePause(m, at(160)); // 60s
    openPause(m, at(300));
    closePause(m, at(330)); // 30s
    expect(m.paused_duration_ms).toBe(90_000);
    expect(recordedDurationSec(m, at(600))).toBe(510);
  });

  it('excludes a pause still open when the meeting ends', () => {
    const m = meeting();
    openPause(m, at(400));
    expect(recordedDurationSec(m, at(600))).toBe(400);
  });

  it('never reports a negative duration and returns null without a start time', () => {
    const m = meeting();
    m.paused_duration_ms = 10_000_000;
    expect(recordedDurationSec(m, at(10))).toBe(0);
    expect(recordedDurationSec({ ...m, started_at: null }, at(10))).toBeNull();
  });

  it('closing a pause that was never opened changes nothing', () => {
    const m = meeting();
    closePause(m, at(50));
    expect(m.paused_duration_ms).toBe(0);
  });
});
