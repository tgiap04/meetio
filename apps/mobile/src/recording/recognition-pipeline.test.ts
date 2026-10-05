import { createRecognitionPipeline } from './recognition-pipeline';
import type { NewSegment } from '../queue/segment-queue';
import type { SttEngine, SttHandlers, SttStartOptions } from './stt-engine';

function setup(mode: 'on_device' | 'server') {
  let handlers!: SttHandlers;
  const timers: { at: number; fn: () => void }[] = [];
  let now = 0;
  const segments: NewSegment[] = [];
  const partials: (string | null)[] = [];
  const starts: SttStartOptions[] = [];
  const engine: SttEngine = { start: (o) => void starts.push(o), stop: () => undefined, subscribe: (h) => ((handlers = h), () => undefined) };
  const pipeline = createRecognitionPipeline({
    engine,
    mode,
    now: () => now,
    schedule: (fn, ms) => {
      const t = { at: now + ms, fn };
      timers.push(t);
      return () => void timers.splice(timers.indexOf(t), 1);
    },
    meetingStartedAt: 0,
    settings: { language: 'vi-VN', audioSource: 'device_mic', quality: 'high' },
    onPartial: (t) => void partials.push(t),
    onSegment: (s) => void segments.push(s),
    onProblem: () => undefined,
    onVolume: () => undefined,
  });
  const advance = (ms: number) => {
    now += ms;
    for (const t of timers.filter((x) => x.at <= now)) {
      timers.splice(timers.indexOf(t), 1);
      t.fn();
    }
  };
  return { pipeline, emit: () => handlers, advance, segments, partials, starts };
}

const settled = async (p: Promise<void>) => {
  let done = false;
  void p.then(() => (done = true));
  await new Promise((r) => setImmediate(r));
  return done;
};

describe('recognition pipeline silence() in server mode', () => {
  it('two concurrent silence() calls both finish as soon as the engine ends', async () => {
    const h = setup('server');
    h.pipeline.listen();
    h.emit().onStart();
    const first = h.pipeline.silence();
    const second = h.pipeline.silence();
    expect(await settled(first)).toBe(false);
    expect(await settled(second)).toBe(false);
    h.emit().onResult('câu cuối', true);
    h.emit().onEnd();
    expect(await settled(first)).toBe(true);
    expect(await settled(second)).toBe(true);
    expect(h.segments.map((s) => s.text)).toEqual(['câu cuối']);
  });

  it('a silence() that comes after another one timed out still waits for the engine', async () => {
    const h = setup('server');
    h.pipeline.listen();
    h.emit().onStart();
    const first = h.pipeline.silence();
    h.advance(40_000);
    expect(await settled(first)).toBe(true);
    const second = h.pipeline.silence();
    expect(await settled(second)).toBe(false);
    h.emit().onEnd();
    expect(await settled(second)).toBe(true);
  });

  it('on-device silence() never waits', async () => {
    const h = setup('on_device');
    h.pipeline.listen();
    h.emit().onStart();
    expect(await settled(h.pipeline.silence())).toBe(true);
  });
});

describe('recognition pipeline results in server mode', () => {
  it('shows streaming partials and settles them on the final; requests interim at high quality', async () => {
    const h = setup('server');
    h.pipeline.listen();
    expect(h.starts[0]).toMatchObject({ interim: true, volume: true });
    h.emit().onStart();
    h.emit().onResult('xin ch', false);
    h.emit().onResult('xin chào', true);
    expect(h.partials).toContain('xin ch');
    expect(h.segments.map((s) => s.text)).toEqual(['xin chào']);
  });
});
