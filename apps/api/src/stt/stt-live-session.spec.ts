import { jest } from '@jest/globals';
import { SttStreamErrorCode } from '@meetio/shared';
import { FakeLiveOpener } from '../test-support/fake-live-opener.js';
import { SttLiveSession, type SttLiveOptions } from './stt-live-session.js';

const OPTIONS: SttLiveOptions = { rotateAfterMs: 60_000, quietWindowMs: 10_000, overlapMs: 1000, flushMs: 500, ringMs: 3000 };
const pcm = (n: number, fill = 1) => Buffer.alloc(n, fill);

function setup(options: Partial<SttLiveOptions> = {}) {
  const opener = new FakeLiveOpener();
  const events: string[] = [];
  const fatal = jest.fn<(code: SttStreamErrorCode, message: string) => void>();
  const session = new SttLiveSession(
    opener,
    'vi-VN',
    { partial: (t) => events.push(`p:${t}`), final: (t) => events.push(`f:${t}`), fatal },
    { ...OPTIONS, ...options },
  );
  return { opener, events, fatal, session };
}

const tick = (ms: number) => jest.advanceTimersByTimeAsync(ms);

describe('SttLiveSession', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('forwards audio to the live session and relays partials and finals', async () => {
    const t = setup();
    await t.session.start();
    t.session.push(pcm(3200));
    t.opener.legs[0].handlers.onInterim('xin ch');
    t.opener.legs[0].handlers.onFinal('xin chào');
    expect(t.opener.legs[0].sent).toHaveLength(1);
    expect(t.events).toEqual(['p:xin ch', 'f:xin chào']);
    t.session.dispose();
  });

  it('start rejects when no live session can be opened', async () => {
    const t = setup();
    t.opener.failOpen = new Error('down');
    await expect(t.session.start()).rejects.toThrow('down');
  });

  it('stop ends the audio, waits for the last final, and closes', async () => {
    const t = setup();
    await t.session.start();
    t.opener.legs[0].handlers.onInterim('câu cuối');
    t.opener.finalOnEnd = 'câu cuối cùng';
    await t.session.stop();
    expect(t.opener.legs[0]).toMatchObject({ ended: true, closed: true });
    expect(t.events).toEqual(['p:câu cuối', 'f:câu cuối cùng']);
  });

  it('stop keeps an unsettled partial as a final when Gemini never settles it (bounded wait)', async () => {
    const t = setup();
    await t.session.start();
    t.opener.legs[0].handlers.onInterim('dở dang');
    const stopped = t.session.stop();
    await tick(500);
    await stopped;
    expect(t.events).toEqual(['p:dở dang', 'f:dở dang']);
  });

  it('rotates at the first pause once the quiet window opens, replaying the overlap and de-duplicating the seam', async () => {
    const t = setup();
    await t.session.start();
    t.session.push(pcm(32_000, 1));
    t.opener.legs[0].handlers.onFinal('chúng ta bắt đầu cuộc họp hôm nay');
    await tick(49_000); // before the window: still one session
    expect(t.opener.legs).toHaveLength(1);
    t.opener.finalOnEnd = null;
    await tick(2000); // window open + a quiet second → rotation
    expect(t.opener.legs).toHaveLength(2);
    const [oldLeg, newLeg] = t.opener.legs;
    expect(oldLeg).toMatchObject({ ended: true, closed: true });
    // The new session heard the last second (32,000 bytes) again, then only live audio.
    expect(Buffer.concat(newLeg.sent).length).toBe(32_000);
    t.session.push(pcm(3200, 9));
    expect(oldLeg.sent).toHaveLength(1);
    expect(newLeg.sent.at(-1)?.[0]).toBe(9);

    newLeg.handlers.onFinal('cuộc họp hôm nay có ba nội dung');
    newLeg.handlers.onFinal('hôm nay hôm nay');
    expect(t.events).toEqual(['f:chúng ta bắt đầu cuộc họp hôm nay', 'f:có ba nội dung', 'f:hôm nay hôm nay']);
    t.session.dispose();
  });

  it('holds the new session back until the old one has settled its last words', async () => {
    const t = setup();
    await t.session.start();
    t.session.push(pcm(3200));
    await tick(49_900);
    // Mid-sentence: the quiet condition fails until the deadline.
    t.opener.legs[0].handlers.onInterim('đang nói dở');
    await tick(10_200);
    expect(t.opener.legs).toHaveLength(2);
    const [oldLeg, newLeg] = t.opener.legs;
    newLeg.handlers.onFinal('đang nói dở rồi nói tiếp');
    expect(t.events).toEqual(['p:đang nói dở']); // still waiting on the old session
    oldLeg.handlers.onFinal('đang nói dở');
    await tick(0);
    expect(t.events).toEqual(['p:đang nói dở', 'f:đang nói dở', 'f:rồi nói tiếp']);
    t.session.dispose();
  });

  it('rotates at the hard deadline even while the speaker keeps talking', async () => {
    const t = setup();
    await t.session.start();
    for (let i = 0; i < 70; i++) {
      t.opener.legs[0].handlers.onInterim(`đang nói ${i}`);
      await tick(1000);
    }
    expect(t.opener.legs.length).toBeGreaterThanOrEqual(2);
    t.session.dispose();
  });

  it('rotates early when Gemini announces the session will end', async () => {
    const t = setup();
    await t.session.start();
    t.opener.legs[0].handlers.onGoAway();
    await tick(0);
    expect(t.opener.legs).toHaveLength(2);
    t.session.dispose();
  });

  it('keeps the old session and retries when a rotation cannot open a new one', async () => {
    const t = setup();
    await t.session.start();
    t.opener.failOpen = new Error('busy');
    t.opener.legs[0].handlers.onGoAway();
    await tick(10);
    expect(t.opener.legs).toHaveLength(1);
    expect(t.opener.legs[0].closed).toBe(false);
    t.opener.failOpen = null;
    await tick(1100);
    expect(t.opener.legs).toHaveLength(2);
    expect(t.fatal).not.toHaveBeenCalled();
    t.session.dispose();
  });

  it('reopens a session that drops unexpectedly and replays what the ring buffer holds', async () => {
    const t = setup();
    await t.session.start();
    t.session.push(pcm(6400, 5));
    t.opener.legs[0].handlers.onFinal('một hai ba');
    t.opener.legs[0].handlers.onClose(true);
    await tick(0);
    expect(t.opener.legs).toHaveLength(2);
    expect(Buffer.concat(t.opener.legs[1].sent).length).toBe(6400);
    t.opener.legs[1].handlers.onFinal('hai ba bốn');
    expect(t.events).toEqual(['f:một hai ba', 'f:bốn']);
    expect(t.fatal).not.toHaveBeenCalled();
    t.session.dispose();
  });

  it('ends the stream when it cannot reopen, or keeps dropping', async () => {
    const t = setup();
    await t.session.start();
    t.opener.failOpen = new Error('gone');
    t.opener.legs[0].handlers.onClose(true);
    await tick(0);
    expect(t.fatal).toHaveBeenCalledWith(SttStreamErrorCode.AI_SERVICE_UNAVAILABLE, expect.any(String));

    const u = setup();
    await u.session.start();
    u.opener.legs[0].handlers.onClose(true);
    await tick(0);
    u.opener.legs[1].handlers.onClose(true);
    await tick(0);
    expect(u.fatal).toHaveBeenCalledTimes(1);
  });

  it('closes every session and emits nothing after dispose', async () => {
    const t = setup();
    await t.session.start();
    t.session.dispose();
    t.opener.legs[0].handlers.onFinal('muộn');
    t.session.push(pcm(3200));
    expect(t.opener.legs[0].closed).toBe(true);
    expect(t.opener.legs[0].sent).toHaveLength(0);
    expect(t.events).toEqual([]);
    await tick(120_000);
    expect(t.opener.legs).toHaveLength(1);
  });
});
