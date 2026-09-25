// Performance test for analyze-run.mjs CLI on synthetic 60-min log (~30k events).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLog } from '../parse-session-log.mjs';
import { computeRunMetrics } from '../run-metrics.mjs';

/**
 * Generate a synthetic log file (~60 minutes, ~9000 reference words, ~30k events).
 * Each session: start, partial×40 (every ~500ms), final, auto_stop.
 * Sessions every ~10s.
 */
function generateSyntheticLog() {
  const vocab = ['một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín', 'mười'];
  let timestamp = 0;
  let sessionCounter = 0;
  const lines = [];

  // metadata
  lines.push(
    JSON.stringify({
      event: 'run_meta',
      timestamp,
      device: 'Pixel7',
      os: 'Android 14',
      engine: 'Google',
      app_state: 'foreground',
      placement: 'in ear',
      distance_cm: '10',
    }),
  );

  lines.push(
    JSON.stringify({
      event: 'mark_playback',
      timestamp: timestamp + 1000,
    }),
  );

  timestamp += 2000;

  // Generate ~360 sessions (one per ~10s) over 60 minutes
  const sessionsTarget = 360;
  for (let s = 0; s < sessionsTarget; s += 1) {
    sessionCounter += 1;
    const sessionId = `s${sessionCounter}`;
    const sessionStartTime = timestamp;

    lines.push(
      JSON.stringify({
        event: 'start',
        timestamp,
        session_id: sessionId,
      }),
    );

    timestamp += 300; // 300ms to first partial

    // Partial events: one every ~50ms, ~40 per session
    let text = '';
    for (let p = 0; p < 40; p += 1) {
      const wordIdx = Math.floor(Math.random() * vocab.length);
      text += (text ? ' ' : '') + vocab[wordIdx];

      lines.push(
        JSON.stringify({
          event: 'partial',
          timestamp,
          session_id: sessionId,
          text,
        }),
      );

      timestamp += 50;
    }

    // Final
    lines.push(
      JSON.stringify({
        event: 'final',
        timestamp,
        session_id: sessionId,
        text,
      }),
    );

    timestamp += 100;

    // Occasionally an error (5% chance)
    if (Math.random() < 0.05) {
      lines.push(
        JSON.stringify({
          event: 'error',
          timestamp,
          session_id: sessionId,
          error: 'no-speech',
        }),
      );
      timestamp += 50;
    }

    // auto_stop
    lines.push(
      JSON.stringify({
        event: 'auto_stop',
        timestamp,
        session_id: sessionId,
      }),
    );

    timestamp += 10000 - (timestamp - sessionStartTime); // pad to ~10s per session
  }

  lines.push(
    JSON.stringify({
      event: 'run_stop',
      timestamp,
    }),
  );

  return lines.join('\n');
}

test('analyze-run on synthetic 60-min log completes in <5000ms', () => {
  const logText = generateSyntheticLog();
  const events = parseLog(logText);

  // Build reference words: ~9000 total from ~25 words/session × 360 sessions
  const referenceWords = Array.from({ length: 9000 }, (_, i) => ({
    word: `word${i}`,
    atMs: i * 400, // stagger them throughout the log
  }));

  const started = Date.now();
  const metrics = computeRunMetrics(events, referenceWords);
  const elapsed = Date.now() - started;

  console.log(`Processed ${events.length} events in ${elapsed}ms`);
  console.log(`Sessions: ${metrics.sessions}, WER: ${metrics.wer?.wer.toFixed(3) ?? 'N/A'}`);

  assert.ok(elapsed < 5000, `took ${elapsed}ms, should be <5000ms`);
  assert.ok(metrics.sessions > 100, 'should have parsed enough sessions');
});
