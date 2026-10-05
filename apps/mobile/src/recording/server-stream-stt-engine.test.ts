import { createServerStreamSttEngine } from './server-stream-stt-engine';
import { ServerSttError } from './server-stt-ports';
import { createStreamSttHarness } from './test-support/fake-stream-stt';
import type { SttEngine, SttStartOptions } from './stt-engine';

const OPTIONS: SttStartOptions = { lang: 'vi-VN', interim: true, bluetooth: false, volume: true, upload: { ownerId: 'u1', meetingId: 'm1' } };

function setup(overrides: Partial<Parameters<typeof createServerStreamSttEngine>[0]> = {}) {
  const h = createStreamSttHarness();
  const engine: SttEngine = createServerStreamSttEngine({ ...h.deps, ...overrides });
  engine.subscribe(h.handlers);
  return { h, engine };
}

const quiet = (collected: string[]) => collected.filter((c) => !c.startsWith('volume:'));
const samples = (frames: Int16Array[]) => frames.reduce((n, f) => n + f.length, 0);

describe('server stream STT engine', () => {
  it('opens the stream for the meeting, starts the microphone and reports start once audio flows', async () => {
    const { h, engine } = setup();
    engine.start(OPTIONS);
    await h.flush();
    expect(h.log.opens).toEqual([{ language: 'vi-VN', meetingId: 'm1' }]);
    expect(h.log.micStarts).toBe(1);
    expect(h.collected).toEqual(['start']);
  });

  it('batches the microphone buffers into ~150 ms frames', async () => {
    const { h, engine } = setup();
    engine.start(OPTIONS);
    await h.flush();
    for (let i = 0; i < 8; i++) h.mic(h.pcm(40)); // 320 ms
    expect(h.log.sent.map((f) => f.length)).toEqual([2400, 2400]); // 150 ms frames; 20 ms stay buffered
    expect(samples(h.log.sent)).toBe(4800);
  });

  it('resamples and downmixes to 16 kHz mono before sending', async () => {
    const { h, engine } = setup();
    engine.start(OPTIONS);
    await h.flush();
    h.mic(h.pcm(300, 500, 48_000));
    expect(samples(h.log.sent)).toBeGreaterThanOrEqual(4800 - 4);
    expect(h.log.sent[0][0]).toBe(500);
  });

  it('maps partials only when interim was requested, finals always', async () => {
    const withInterim = setup();
    withInterim.engine.start(OPTIONS);
    await withInterim.h.flush();
    withInterim.h.server().onPartial('xin ch');
    withInterim.h.server().onFinal('xin chào');
    expect(withInterim.h.collected).toEqual(['start', 'partial:xin ch', 'final:xin chào']);

    const without = setup();
    without.engine.start({ ...OPTIONS, interim: false });
    await without.h.flush();
    without.h.server().onPartial('xin ch');
    without.h.server().onFinal('xin chào');
    expect(without.h.collected).toEqual(['start', 'final:xin chào']);
  });

  it('reports the input level from the PCM RMS, throttled, only when volume was asked for', async () => {
    const { h, engine } = setup();
    engine.start(OPTIONS);
    await h.flush();
    h.mic(h.pcm(20, 3000));
    h.mic(h.pcm(20, 3000)); // within the meter interval
    await h.advance(200);
    h.mic(h.pcm(20, 0));
    const volumes = h.collected.filter((c) => c.startsWith('volume:'));
    expect(volumes).toHaveLength(2);
    expect(Number(volumes[0].slice(7))).toBeGreaterThan(Number(volumes[1].slice(7)));
    expect(volumes[1]).toBe('volume:-2.0');

    const quiet = setup();
    quiet.engine.start({ ...OPTIONS, volume: false });
    await quiet.h.flush();
    quiet.h.mic(quiet.h.pcm(20, 3000));
    expect(quiet.h.collected).toEqual(['start']);
  });

  it('stop sends the tail, waits for the server flush, then ends once', async () => {
    const { h, engine } = setup();
    engine.start(OPTIONS);
    await h.flush();
    h.mic(h.pcm(100));
    h.control.finalOnEnd = 'câu cuối';
    engine.stop();
    engine.stop();
    await h.flush();
    expect(h.log.micStops).toBe(1);
    expect(samples(h.log.sent)).toBe(1600); // the 100 ms that had not filled a frame
    expect(h.log.ends).toBe(1);
    expect(quiet(h.collected)).toEqual(['start', 'final:câu cuối', 'end']);
    expect(h.log.closes).toBeGreaterThan(0);
  });

  it('stop does not wait forever for a server that never answers', async () => {
    const { h, engine } = setup();
    engine.start(OPTIONS);
    await h.flush();
    h.control.endHangs = true;
    engine.stop();
    await h.flush();
    expect(h.collected).toEqual(['start']);
    await h.advance(4000);
    expect(h.collected).toEqual(['start', 'end']);
  });

  it('stop pressed while starting ends right after the start', async () => {
    const { h, engine } = setup();
    engine.start(OPTIONS);
    engine.stop();
    await h.flush();
    expect(h.collected).toEqual(['start', 'end']);
  });

  it('refuses to start for a different signed-in user, without opening the stream or the microphone', async () => {
    const { h, engine } = setup();
    h.control.ownerError = new Error('other user');
    engine.start(OPTIONS);
    await h.flush();
    expect(h.collected).toEqual(['error:owner-changed', 'end']);
    expect(h.log.opens).toHaveLength(0);
    expect(h.log.micStarts).toBe(0);
  });

  it('reports stream-failed when the stream cannot be opened', async () => {
    const { h, engine } = setup();
    h.control.openFailures = Infinity;
    engine.start(OPTIONS);
    await h.flush();
    expect(h.collected).toEqual(['error:stream-failed', 'end']);
    expect(h.log.micStarts).toBe(0);
  });

  it('reports the microphone problem with its own code and closes the stream', async () => {
    const { h, engine } = setup();
    h.control.micError = h.micDenied();
    engine.start(OPTIONS);
    await h.flush();
    expect(h.collected).toEqual(['error:not-allowed', 'end']);
    expect(h.log.closes).toBeGreaterThan(0);
  });

  it('reports a microphone capture failure as stream-failed so the chunked engine gets a try, but keeps not-allowed as is', async () => {
    const { h, engine } = setup();
    h.control.micError = new ServerSttError('audio-capture', 'busy');
    engine.start(OPTIONS);
    await h.flush();
    expect(h.collected).toEqual(['error:stream-failed', 'end']);
  });

  it('an expired token ends the server stream but reconnects (fresh handshake, new stream) instead of failing', async () => {
    const { h, engine } = setup();
    engine.start(OPTIONS);
    await h.flush();
    h.server().onFatal('TOKEN_EXPIRED');
    h.mic(h.pcm(300)); // offline until the new stream is up
    expect(h.log.sent).toHaveLength(0);
    await h.advance(1000);
    expect(h.log.opens).toHaveLength(2);
    expect(samples(h.log.sent)).toBe(4800);
    expect(quiet(h.collected)).toEqual(['start']);
  });

  it('a connection drop while still starting is not lost: it reconnects once recording begins', async () => {
    const { h, engine } = setup();
    let release!: () => void;
    h.control.micGate = new Promise<void>((r) => (release = r));
    engine.start(OPTIONS);
    await h.flush();
    h.server().onDown(); // channel open, microphone not yet running
    release();
    await h.flush();
    expect(h.collected).toEqual(['start']);
    await h.advance(1000);
    expect(h.log.opens).toHaveLength(2);
  });

  it('a fatal server error ends the stream with stream-failed', async () => {
    const { h, engine } = setup();
    engine.start(OPTIONS);
    await h.flush();
    h.server().onFatal('QUOTA_EXCEEDED');
    await h.flush();
    expect(h.collected).toEqual(['start', 'error:stream-failed', 'end']);
    expect(h.micRunning()).toBe(false);
  });

  it('can start again after it ended', async () => {
    const { h, engine } = setup();
    engine.start(OPTIONS);
    await h.flush();
    engine.stop();
    await h.flush();
    engine.start(OPTIONS);
    await h.flush();
    expect(h.collected).toEqual(['start', 'end', 'start']);
  });

  describe('reconnect', () => {
    it('reopens a dropped connection after re-checking the owner, replaying the audio kept meanwhile', async () => {
      const { h, engine } = setup();
      engine.start(OPTIONS);
      await h.flush();
      h.server().onDown();
      await h.flush();
      h.mic(h.pcm(300)); // offline: kept
      expect(h.log.sent).toHaveLength(0);
      await h.advance(1000);
      expect(h.log.opens).toHaveLength(2);
      expect(samples(h.log.sent)).toBe(4800);
      expect(quiet(h.collected)).toEqual(['start']);
    });

    it('drops the oldest audio past the backlog limit and reports it as a gap', async () => {
      const { h, engine } = setup();
      engine.start(OPTIONS);
      await h.flush();
      h.server().onDown();
      for (let i = 0; i < 12; i++) h.mic(h.pcm(500)); // 6 s offline, 4 s kept
      await h.advance(1000);
      expect(h.collected).toContain('gap:2000');
      expect(samples(h.log.sent)).toBe(62_400); // 4 s kept; the last partial frame waits for more audio
    });

    it('stops with owner-changed when another account signed in meanwhile', async () => {
      const { h, engine } = setup();
      engine.start(OPTIONS);
      await h.flush();
      h.server().onDown();
      h.control.ownerError = new Error('other user');
      await h.advance(1000);
      expect(h.collected).toEqual(['start', 'error:owner-changed', 'end']);
      expect(h.log.opens).toHaveLength(1);
    });

    it('gives up with stream-failed after the last attempt fails', async () => {
      const { h, engine } = setup();
      engine.start(OPTIONS);
      await h.flush();
      h.control.openFailures = Infinity;
      h.server().onDown();
      await h.advance(1000 + 2000 + 4000);
      expect(h.log.opens).toHaveLength(4);
      expect(h.collected).toEqual(['start', 'error:stream-failed', 'end']);
    });

    it('does not reconnect once stop was pressed', async () => {
      const { h, engine } = setup();
      engine.start(OPTIONS);
      await h.flush();
      h.server().onDown();
      engine.stop();
      await h.advance(10_000);
      expect(h.log.opens).toHaveLength(1);
      expect(h.collected.at(-1)).toBe('end');
    });
  });
});
