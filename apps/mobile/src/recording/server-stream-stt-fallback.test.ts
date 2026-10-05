import { createFallbackSttEngine } from './server-stream-stt-fallback';
import type { SttEngine, SttHandlers, SttStartOptions } from './stt-engine';

const OPTIONS: SttStartOptions = { lang: 'vi-VN', interim: true, bluetooth: false, volume: true };

/** A scriptable engine: records start/stop, and lets the test emit its events. */
function fakeEngine() {
  const subs = new Set<SttHandlers>();
  const calls: string[] = [];
  const engine: SttEngine = {
    start: () => void calls.push('start'),
    stop: () => void calls.push('stop'),
    subscribe: (h) => (subs.add(h), () => void subs.delete(h)),
  };
  const say = (fn: (h: SttHandlers) => void) => subs.forEach(fn);
  return { engine, calls, say };
}

function setup() {
  const primary = fakeEngine();
  const secondary = fakeEngine();
  let now = 0;
  const fallback = createFallbackSttEngine({ primary: primary.engine, secondary: secondary.engine, now: () => now });
  const seen: string[] = [];
  fallback.subscribe({
    onStart: () => seen.push('start'),
    onResult: (t, f) => seen.push(`${f ? 'final' : 'partial'}:${t}`),
    onError: (c) => seen.push(`error:${c}`),
    onEnd: () => seen.push('end'),
    onVolume: () => seen.push('volume'),
    onGap: (ms) => seen.push(`gap:${ms}`),
  });
  return { primary, secondary, fallback, seen, tick: (ms: number) => void (now += ms) };
}

const fail = (e: ReturnType<typeof fakeEngine>) => {
  e.say((h) => h.onError('stream-failed', 'x'));
  e.say((h) => h.onEnd());
};

describe('stream → chunked fallback engine', () => {
  it('runs the streaming engine and forwards its events', () => {
    const t = setup();
    t.fallback.start(OPTIONS);
    t.primary.say((h) => h.onStart());
    t.primary.say((h) => h.onResult('a', false));
    t.primary.say((h) => h.onResult('a b', true));
    expect(t.primary.calls).toEqual(['start']);
    expect(t.secondary.calls).toEqual([]);
    expect(t.seen).toEqual(['start', 'partial:a', 'final:a b']);
  });

  it('switches to the chunked engine when the stream fails, hiding the failure and reporting the gap', () => {
    const t = setup();
    t.fallback.start(OPTIONS);
    t.primary.say((h) => h.onStart());
    t.tick(10_000);
    fail(t.primary);
    expect(t.secondary.calls).toEqual(['start']);
    t.tick(1200);
    t.secondary.say((h) => h.onStart());
    t.secondary.say((h) => h.onResult('chunk text', true));
    expect(t.seen).toEqual(['start', 'gap:1200', 'start', 'final:chunk text']);
  });

  it('falls back when the stream fails before it ever started', () => {
    const t = setup();
    t.fallback.start(OPTIONS);
    fail(t.primary);
    t.secondary.say((h) => h.onStart());
    expect(t.seen).toEqual(['start']);
  });

  it('forwards other errors untouched (microphone, owner) and the end that follows', () => {
    const t = setup();
    t.fallback.start(OPTIONS);
    t.primary.say((h) => h.onError('not-allowed', 'x'));
    t.primary.say((h) => h.onEnd());
    expect(t.seen).toEqual(['error:not-allowed', 'end']);
    expect(t.secondary.calls).toEqual([]);
  });

  it('stop goes to whichever engine is running; the end comes from it', () => {
    const t = setup();
    t.fallback.start(OPTIONS);
    t.primary.say((h) => h.onStart());
    t.fallback.stop();
    t.fallback.stop();
    expect(t.primary.calls).toEqual(['start', 'stop']);
    t.primary.say((h) => h.onEnd());
    expect(t.seen).toEqual(['start', 'end']);
  });

  it('a stop that arrives while switching ends the recording without starting the chunked engine', () => {
    const t = setup();
    t.fallback.start(OPTIONS);
    t.primary.say((h) => h.onStart());
    t.primary.say((h) => h.onError('stream-failed', 'x'));
    t.fallback.stop();
    t.primary.say((h) => h.onEnd());
    expect(t.secondary.calls).toEqual([]);
    expect(t.seen).toEqual(['start', 'end']);
  });

  it('falls back once per recording: later starts stay on the chunked engine until a stop finishes it', () => {
    const t = setup();
    t.fallback.start(OPTIONS);
    fail(t.primary);
    t.secondary.say((h) => h.onStart());
    // The chunked engine died on its own (fatal) and the restart loop starts it again.
    t.secondary.say((h) => h.onError('audio-capture', 'x'));
    t.secondary.say((h) => h.onEnd());
    t.fallback.start(OPTIONS);
    expect(t.primary.calls).toEqual(['start']);
    expect(t.secondary.calls).toEqual(['start', 'start']);
    // Now the user stops: the recording is over and the next one tries the stream again.
    t.fallback.stop();
    t.secondary.say((h) => h.onEnd());
    t.fallback.start(OPTIONS);
    expect(t.primary.calls).toEqual(['start', 'start']);
  });

  it('ignores events from the engine that is not current', () => {
    const t = setup();
    t.fallback.start(OPTIONS);
    fail(t.primary);
    t.secondary.say((h) => h.onStart());
    t.primary.say((h) => h.onResult('late', true));
    expect(t.seen).toEqual(['start']);
  });
});
