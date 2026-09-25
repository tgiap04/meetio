// Adversarial tests for buildSessions and computeRunMetrics
// Edge cases: restart without start, app_background never followed by app_foreground,
// multiple mark_playback, iOS-style cumulative finals.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSessions } from '../parse-session-log.mjs';
import { computeRunMetrics } from '../run-metrics.mjs';

test('session without start event is ignored', () => {
  const events = [
    { event: 'run_meta', timestamp: 0 },
    // s1 starts normally
    { event: 'start', timestamp: 100, session_id: 's1' },
    { event: 'final', timestamp: 200, session_id: 's1', text: 'hello' },
    { event: 'auto_stop', timestamp: 300, session_id: 's1' },
    // Stray final for non-existent s2 (no start event)
    { event: 'final', timestamp: 400, session_id: 's2', text: 'orphan' },
    { event: 'run_stop', timestamp: 500 },
  ];

  const { sessions } = buildSessions(events);
  assert.equal(sessions.length, 1, 'should only have s1 (s2 has no start event)');
  assert.equal(sessions[0].id, 's1');
});

test('app_background without closing app_foreground marks session as background', () => {
  const events = [
    { event: 'app_background', timestamp: 100 },
    { event: 'start', timestamp: 200, session_id: 's1' },
    { event: 'final', timestamp: 300, session_id: 's1', text: 'hello' },
    { event: 'auto_stop', timestamp: 400, session_id: 's1' },
    // Never sends app_foreground
    { event: 'run_stop', timestamp: 500 },
  ];

  const { sessions } = buildSessions(events);
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].background, true, 'session should be marked as background');
});

test('multiple mark_playback uses the first one', () => {
  const events = [
    { event: 'mark_playback', timestamp: 100 },
    { event: 'start', timestamp: 200, session_id: 's1' },
    { event: 'final', timestamp: 300, session_id: 's1', text: 'hello' },
    { event: 'auto_stop', timestamp: 400, session_id: 's1' },
    { event: 'mark_playback', timestamp: 500 }, // Second one should be ignored
    { event: 'run_stop', timestamp: 600 },
  ];

  const { playbackStartedAt } = buildSessions(events);
  assert.equal(playbackStartedAt, 100, 'should use first mark_playback');
});

test('iOS cumulative finals merge correctly', () => {
  // iOS sends final events with full accumulated text, not just new words.
  // The mergeRecognizedText function should handle "has prefix" case.
  const events = [
    { event: 'start', timestamp: 100, session_id: 's1' },
    { event: 'final', timestamp: 200, session_id: 's1', text: 'hello' },
    { event: 'final', timestamp: 300, session_id: 's1', text: 'hello world' }, // Has prefix
    { event: 'final', timestamp: 400, session_id: 's1', text: 'hello world again' }, // Has prefix
    { event: 'auto_stop', timestamp: 500, session_id: 's1' },
  ];

  const { sessions } = buildSessions(events);
  assert.equal(sessions[0].text, 'hello world again', 'should accumulate without duplication');
});

test('partial text at session end is merged into final text', () => {
  // If a session ends with a pending partial result, it should be merged into the final text.
  const events = [
    { event: 'start', timestamp: 100, session_id: 's1' },
    { event: 'final', timestamp: 200, session_id: 's1', text: 'hello' },
    { event: 'partial', timestamp: 250, session_id: 's1', text: 'hello world' },
    { event: 'auto_stop', timestamp: 300, session_id: 's1' },
  ];

  const { sessions } = buildSessions(events);
  assert.equal(
    sessions[0].text,
    'hello world',
    'pending partial should be merged when session ends',
  );
});

test('error does not close session, only marks endReason', () => {
  const events = [
    { event: 'start', timestamp: 100, session_id: 's1' },
    { event: 'final', timestamp: 200, session_id: 's1', text: 'hello' },
    { event: 'error', timestamp: 250, session_id: 's1', error: 'network' },
    // Session continues after error
    { event: 'final', timestamp: 300, session_id: 's1', text: 'hello world' },
    // auto_stop marks actual end
    { event: 'auto_stop', timestamp: 350, session_id: 's1' },
  ];

  const { sessions } = buildSessions(events);
  assert.equal(sessions[0].text, 'hello world', 'should continue after error');
  assert.equal(sessions[0].endReason, 'error', 'endReason should reflect error');
});

test('computeRunMetrics with no sessions', () => {
  const events = [
    { event: 'run_meta', timestamp: 0 },
    { event: 'mark_playback', timestamp: 100 },
    { event: 'run_stop', timestamp: 200 },
  ];

  const metrics = computeRunMetrics(events, []);
  assert.equal(metrics.sessions, 0);
  assert.equal(metrics.runMinutes, 0);
  assert.equal(metrics.wer, null);
});

test('gaps calculation handles unrecovered stops', () => {
  // Simulate two sessions where the second one never starts (unrecovered stop).
  const events = [
    { event: 'start', timestamp: 100, session_id: 's1' },
    { event: 'final', timestamp: 200, session_id: 's1', text: 'hello' },
    { event: 'auto_stop', timestamp: 300, session_id: 's1' },
    // No restart, no s2
    { event: 'run_stop', timestamp: 400 },
  ];

  const metrics = computeRunMetrics(events, []);
  assert.equal(metrics.unrecoveredStops, 1, 'should count unrecovered stop');
  assert.equal(metrics.restarts, 0, 'restarts = sessions - 1 = 0');
});

test('background stats accumulates during background periods', () => {
  const events = [
    { event: 'app_background', timestamp: 100 },
    { event: 'start', timestamp: 200, session_id: 's1' },
    { event: 'final', timestamp: 300, session_id: 's1', text: 'a b c' },
    { event: 'auto_stop', timestamp: 400, session_id: 's1' },
    { event: 'app_foreground', timestamp: 500 }, // 500 - 100 = 400ms in background
    { event: 'app_background', timestamp: 600 },
    { event: 'start', timestamp: 700, session_id: 's2' },
    { event: 'final', timestamp: 800, session_id: 's2', text: 'x y z' },
    { event: 'auto_stop', timestamp: 900, session_id: 's2' },
    // No foreground event at end, so 900 - 600 = 300ms still in background
    { event: 'run_stop', timestamp: 1000 },
  ];

  const metrics = computeRunMetrics(events, []);
  // First bg: 500 - 100 = 400ms
  // Second bg: 1000 - 600 = 400ms (assuming run_stop becomes the boundary)
  assert.equal(metrics.background.backgroundMs, 800, 'should sum both background periods');
});
