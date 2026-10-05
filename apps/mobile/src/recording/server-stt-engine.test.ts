import { createServerSttEngine } from './server-stt-engine';
import { dbfsToVolume, ServerSttError } from './server-stt-ports';
import { createServerSttHarness, FakeFatalUploadError } from './test-support/fake-server-stt';
import type { SttStartOptions } from './stt-engine';

const UPLOAD = { ownerId: 'u1', meetingId: 'm1' };
const OPTIONS: SttStartOptions = { lang: 'vi-VN', interim: true, bluetooth: false, volume: false, upload: UPLOAD };

function setup(options: Partial<SttStartOptions> = {}, chunkMs = 10_000) {
  const h = createServerSttHarness();
  const engine = createServerSttEngine({ ...h.deps, chunkMs });
  const rec = h.recordEvents();
  engine.subscribe(rec.handlers);
  const start = async () => {
    engine.start({ ...OPTIONS, ...options });
    await h.flush();
  };
  return { ...h, engine, events: rec.events, start };
}

describe('createServerSttEngine', () => {
  it('emits start once recording and nothing else on its own (no end for the restart loop to chase)', async () => {
    const t = setup();
    await t.start();
    expect(t.events).toEqual(['start']);
    expect(t.log.opens).toEqual([{ volume: false }]);
    await t.advance(5_000);
    expect(t.events).toEqual(['start']);
    expect(t.log.finishes).toBe(0);
  });

  it('rotates the chunk every STT_CHUNK_MS: stop, upload, start the next one at once', async () => {
    const t = setup();
    await t.start();
    await t.advance(9_999);
    expect(t.log.finishes).toBe(0);
    await t.advance(1);
    expect(t.log.finishes).toBe(1);
    expect(t.log.begins).toBe(2);
    expect(t.uploads).toHaveLength(1);
    expect(t.uploads[0]).toMatchObject({ uri: 'file:///cache/chunk-1.m4a', language: 'vi-VN' });
    await t.advance(10_000);
    expect(t.log.finishes).toBe(2);
    expect(t.log.begins).toBe(3);
  });

  it('reports each transcript as a final result, trimmed', async () => {
    const t = setup();
    await t.start();
    await t.advance(10_000);
    t.uploads[0].resolve('  xin chào mọi người \n');
    await t.flush();
    expect(t.events).toEqual(['start', 'result:final:xin chào mọi người']);
  });

  it('uploads sequentially: text keeps chunk order even when the server answers the later chunk first', async () => {
    const t = setup();
    await t.start();
    await t.advance(10_000);
    await t.advance(10_000);
    // Chunk 2 is finished but must wait for chunk 1 — only one request in flight.
    expect(t.uploads).toHaveLength(1);
    t.uploads[0].resolve('một');
    await t.flush();
    expect(t.uploads).toHaveLength(2);
    t.uploads[1].resolve('hai');
    await t.flush();
    expect(t.events.filter((e) => e.startsWith('result'))).toEqual(['result:final:một', 'result:final:hai']);
  });

  it('skips chunks without speech', async () => {
    const t = setup();
    await t.start();
    await t.advance(10_000);
    t.uploads[0].resolve('   ');
    await t.flush();
    expect(t.events).toEqual(['start']);
    expect(t.log.deleted).toEqual(['file:///cache/chunk-1.m4a']);
  });

  it('turns a failed upload into a gap as long as the chunk, keeps going, and keeps the order', async () => {
    const t = setup();
    await t.start();
    await t.advance(10_000);
    await t.advance(10_000);
    t.uploads[0].reject(new Error('Network Error'));
    await t.flush();
    t.uploads[1].resolve('sau khi mất mạng');
    await t.flush();
    expect(t.events).toEqual(['start', 'gap:10000', 'result:final:sau khi mất mạng']);
  });

  it('deletes every chunk file after its upload attempt, whether it succeeded or failed', async () => {
    const t = setup();
    await t.start();
    await t.advance(10_000);
    await t.advance(10_000);
    expect(t.log.deleted).toEqual([]);
    t.uploads[0].resolve('ok');
    await t.flush();
    expect(t.log.deleted).toEqual(['file:///cache/chunk-1.m4a']);
    t.uploads[1].reject(new Error('503'));
    await t.flush();
    expect(t.log.deleted).toEqual(['file:///cache/chunk-1.m4a', 'file:///cache/chunk-2.m4a']);
  });

  it('survives a file that cannot be deleted', async () => {
    const t = setup();
    const failing = createServerSttEngine({ ...t.deps, deleteFile: () => Promise.reject(new Error('EBUSY')) });
    const rec = t.recordEvents();
    failing.subscribe(rec.handlers);
    failing.start(OPTIONS);
    await t.flush();
    await t.advance(10_000);
    t.uploads[0].resolve('một');
    await t.flush();
    await t.advance(10_000);
    t.uploads[1].resolve('hai');
    await t.flush();
    expect(rec.events).toEqual(['start', 'result:final:một', 'result:final:hai']);
  });

  it('stop() flushes the chunk in progress, waits for its upload, then ends', async () => {
    const t = setup();
    await t.start();
    await t.advance(4_000);
    t.engine.stop();
    await t.flush();
    expect(t.log.finishes).toBe(1);
    expect(t.uploads).toHaveLength(1);
    expect(t.events).toEqual(['start']); // not ended before the last text is in
    t.uploads[0].resolve('câu cuối');
    await t.flush();
    expect(t.events).toEqual(['start', 'result:final:câu cuối', 'end']);
    expect(t.log.closes).toBe(1);
    expect(t.log.deleted).toHaveLength(1);
  });

  it('stop() does not rotate any more and a failed last upload is a gap before the end', async () => {
    const t = setup();
    await t.start();
    await t.advance(4_000);
    t.engine.stop();
    await t.flush();
    t.uploads[0].reject(new Error('offline'));
    await t.flush();
    await t.advance(60_000);
    expect(t.events).toEqual(['start', 'gap:4000', 'end']);
    expect(t.log.finishes).toBe(1);
  });

  it('does not upload a sliver left by stopping right after a rotation', async () => {
    const t = setup();
    await t.start();
    await t.advance(10_000);
    t.engine.stop();
    await t.flush();
    t.uploads[0].resolve('');
    await t.flush();
    expect(t.uploads).toHaveLength(1);
    expect(t.events).toEqual(['start', 'end']);
    expect(t.log.deleted).toHaveLength(2);
  });

  it('can be started again after it ended', async () => {
    const t = setup();
    await t.start();
    await t.advance(1_000);
    t.engine.stop();
    await t.flush();
    t.uploads[0].resolve('');
    await t.flush();
    expect(t.events.at(-1)).toBe('end');
    await t.start();
    expect(t.events.at(-1)).toBe('start');
    expect(t.log.opens).toHaveLength(2);
  });

  it('ignores start() while already running (a late restart from the loop must not double-record)', async () => {
    const t = setup();
    await t.start();
    await t.start();
    expect(t.log.opens).toHaveLength(1);
    expect(t.events).toEqual(['start']);
  });

  it('stop() while still starting ends cleanly without ever reporting start', async () => {
    const t = setup();
    t.engine.start(OPTIONS);
    t.engine.stop();
    await t.flush();
    await t.advance(1_000);
    expect(t.events).not.toContain('start');
    expect(t.events.at(-1)).toBe('end');
    expect(t.log.closes).toBe(1);
  });

  it('maps a denied microphone to not-allowed, then ends', async () => {
    const t = setup();
    t.control.openError = new ServerSttError('not-allowed', 'Microphone permission denied');
    await t.start();
    expect(t.events).toEqual(['error:not-allowed', 'end']);
  });

  it('maps any other recorder failure to audio-capture', async () => {
    const t = setup();
    t.control.beginError = new Error('prepare failed');
    await t.start();
    expect(t.events).toEqual(['error:audio-capture', 'end']);
  });

  it('a recorder that dies at rotation reports audio-capture after handing over the finished chunk', async () => {
    const t = setup();
    await t.start();
    t.control.beginError = new Error('mic taken by another app');
    await t.advance(10_000);
    t.uploads[0].resolve('đoạn cuối');
    await t.flush();
    expect(t.events).toEqual(['start', 'error:audio-capture', 'result:final:đoạn cuối', 'end']);
  });

  it('a chunk the recorder cannot close is a gap, not a crash', async () => {
    const t = setup();
    await t.start();
    t.control.finishReturnsNull = true;
    await t.advance(10_000);
    expect(t.events).toEqual(['start', 'gap:10000']);
    expect(t.uploads).toHaveLength(0);
  });

  it('drops chunks beyond the upload backlog as gaps instead of filling the disk offline', async () => {
    const h = createServerSttHarness();
    const engine = createServerSttEngine({ ...h.deps, maxPendingChunks: 2 });
    const rec = h.recordEvents();
    engine.subscribe(rec.handlers);
    engine.start(OPTIONS);
    await h.flush();
    await h.advance(30_000); // 3 chunks, the first upload hangs
    expect(rec.events).toEqual(['start', 'gap:10000']);
    expect(h.log.deleted).toHaveLength(1);
  });

  it('polls the meter every 150ms while recording when volume is requested', async () => {
    const t = setup({ volume: true });
    t.control.level = -30;
    await t.start();
    await t.advance(450);
    expect(t.events.filter((e) => e.startsWith('volume'))).toHaveLength(3);
    t.engine.stop();
    await t.flush();
    const before = t.events.length;
    await t.advance(1_000);
    expect(t.events.slice(before).filter((e) => e.startsWith('volume'))).toEqual([]);
  });

  it('does not meter when volume is off, and skips unavailable readings', async () => {
    const off = setup({ volume: false });
    await off.start();
    await off.advance(1_000);
    expect(off.events).toEqual(['start']);
    const noLevel = setup({ volume: true });
    noLevel.control.level = null;
    await noLevel.start();
    await noLevel.advance(1_000);
    expect(noLevel.events).toEqual(['start']);
  });

  it('stops notifying an unsubscribed handler', async () => {
    const t = setup();
    const extra = t.recordEvents();
    const unsubscribe = t.engine.subscribe(extra.handlers);
    unsubscribe();
    await t.start();
    expect(extra.events).toEqual([]);
  });
});

describe('owner guard and attribution', () => {
  it('hands every upload the meeting context it was started with', async () => {
    const t = setup();
    await t.start();
    await t.advance(10_000);
    expect(t.uploads[0].upload).toEqual(UPLOAD);
  });

  it('refuses to open the microphone when the signed-in user is not the meeting owner', async () => {
    const t = setup();
    t.control.ownerError = new Error('owner changed');
    await t.start();
    expect(t.events).toEqual(['error:owner-changed', 'end']);
    expect(t.log.opens).toEqual([]);
  });

  it('a fatal upload error (account changed mid-meeting) stops recording: error, flush nothing more, end, no gap', async () => {
    const t = setup();
    await t.start();
    await t.advance(10_000);
    await t.advance(10_000); // second chunk waits behind the first
    t.uploads[0].reject(new FakeFatalUploadError('owner mismatch'));
    await t.flush();
    expect(t.events).toEqual(['start', 'error:owner-changed', 'end']);
    expect(t.uploads).toHaveLength(1); // the queued chunk is never sent under another account
    expect(t.log.deleted).toHaveLength(2);
    expect(t.log.closes).toBe(1);
    await t.advance(60_000);
    expect(t.log.finishes).toBe(2); // no more rotation after the stop
  });
});

describe('stale queued operations (epoch)', () => {
  /** A rotation held at `finish()` with a failing next `begin()`, and `stop()` queued behind it. */
  async function stopBehindFailingRotate() {
    const t = setup();
    await t.start();
    await t.advance(9_999);
    let release!: () => void;
    t.control.finishGate = new Promise<void>((resolve) => (release = resolve));
    t.control.beginError = new Error('mic taken by another app');
    await t.advance(1); // rotation timer fires and blocks inside finish()
    t.engine.stop(); // shutdown now waits behind the rotation
    return { t, release: () => release() };
  }

  it('a stop queued behind a rotation whose next chunk fails ends exactly once, with no bogus gap or upload', async () => {
    const { t, release } = await stopBehindFailingRotate();
    t.control.finishGate = null;
    release();
    await t.flush();
    t.uploads[0].resolve('đoạn cuối');
    await t.flush();
    await t.advance(1_000);
    expect(t.events).toEqual(['start', 'error:audio-capture', 'result:final:đoạn cuối', 'end']);
    expect(t.uploads).toHaveLength(1);
    expect(t.log.closes).toBe(1);
  });

  it('a restart between the failure and the stale stop keeps the new run recording', async () => {
    const { t, release } = await stopBehindFailingRotate();
    t.engine.subscribe({
      ...t.recordEvents().handlers,
      onEnd: () => {
        t.control.beginError = null;
        t.engine.start(OPTIONS); // the restart loop's reaction to the end
      },
    });
    t.control.finishGate = null;
    release();
    await t.flush();
    t.uploads[0].resolve('');
    await t.flush();
    await t.advance(1);
    expect(t.events.filter((e) => e === 'end')).toHaveLength(1);
    expect(t.events.at(-1)).toBe('start');
    expect(t.log.opens).toHaveLength(2);
    await t.advance(10_000); // the new run still rotates: it was not torn down
    expect(t.log.finishes).toBeGreaterThanOrEqual(2);
    expect(t.uploads.length).toBeGreaterThanOrEqual(2);
  });
});

describe('dbfsToVolume', () => {
  it('maps silence to -2 and full scale to 10, linearly in between', () => {
    expect(dbfsToVolume(-160)).toBe(-2);
    expect(dbfsToVolume(-60)).toBe(-2);
    expect(dbfsToVolume(0)).toBe(10);
    expect(dbfsToVolume(-30)).toBeCloseTo(4);
  });

  it('clamps out-of-range and non-finite readings', () => {
    expect(dbfsToVolume(6)).toBe(10);
    expect(dbfsToVolume(Number.NaN)).toBe(-2);
    expect(dbfsToVolume(Number.NEGATIVE_INFINITY)).toBe(-2);
  });
});
