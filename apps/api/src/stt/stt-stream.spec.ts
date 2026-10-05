import { jest } from '@jest/globals';
import { ForbiddenException } from '@nestjs/common';
import { SttStreamErrorCode } from '@meetio/shared';
import { AiServiceUnavailableError, QuotaExceededError } from '../ai/ai-errors.js';
import type { GeminiLiveClient } from '../ai/gemini-live.js';
import type { UsageEntry, UsageTracker } from '../ai/usage-tracker.js';
import { FakeLiveOpener } from '../test-support/fake-live-opener.js';
import { SttStream, type SttStreamOptions } from './stt-stream.js';
import { SttStreamRefusal, SttStreamService } from './stt-stream.service.js';
import type { SttService } from './stt.service.js';

const OPTIONS: SttStreamOptions = { rotateAfterMs: 600_000, quietWindowMs: 30_000, overlapMs: 1000, flushMs: 500, ringMs: 3000, usageIntervalMs: 60_000, maxFrameBytes: 8000 };
const U1 = '00000000-0000-4000-8000-000000000001';
const M1 = '00000000-0000-4000-8000-0000000000aa';
const frame = (n: number) => Buffer.alloc(n, 1);

function usageStub() {
  const rows: UsageEntry[] = [];
  const usage = {
    record: jest.fn(async (e: UsageEntry) => void rows.push(e)),
    assertWithinBudget: jest.fn<UsageTracker['assertWithinBudget']>(async () => undefined),
  };
  return { usage, rows };
}

function streamSetup(extra: { assertConsent?: () => Promise<void>; tokenExpiresAtMs?: number } = {}) {
  const opener = new FakeLiveOpener();
  const { usage, rows } = usageStub();
  const log: string[] = [];
  const sink = { partial: (t: string) => log.push(`p:${t}`), final: (t: string) => log.push(`f:${t}`), fatal: (c: string) => log.push(`!${c}`) };
  const ended = jest.fn();
  const stream = new SttStream({ opener, usage, options: OPTIONS, userId: U1, meetingId: M1, language: 'vi-VN', assertConsent: async () => undefined, ...extra }, sink, ended);
  return { opener, usage, rows, log, ended, stream };
}

describe('SttStream', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('passes valid frames to Live and ends cleanly on stop, exactly once', async () => {
    const t = streamSetup();
    await t.stream.start();
    t.stream.push(frame(3200));
    t.stream.push(new Uint8Array(3200));
    t.stream.push(new Uint8Array(3200).buffer);
    expect(t.opener.legs[0].sent).toHaveLength(3);
    await t.stream.stop();
    await t.stream.stop();
    expect(t.ended).toHaveBeenCalledTimes(1);
    expect(t.opener.legs[0].closed).toBe(true);
  });

  it.each([
    ['text', 'not audio', SttStreamErrorCode.VALIDATION_ERROR],
    ['an empty frame', Buffer.alloc(0), SttStreamErrorCode.VALIDATION_ERROR],
    ['an odd byte count', Buffer.alloc(3201), SttStreamErrorCode.VALIDATION_ERROR],
    ['an oversized frame', Buffer.alloc(8002), SttStreamErrorCode.RATE_LIMITED],
  ])('ends the stream with an error code for %s', async (_name, data, code) => {
    const t = streamSetup();
    await t.stream.start();
    t.stream.push(data);
    expect(t.log).toEqual([`!${code}`]);
    expect(t.opener.legs[0].closed).toBe(true);
    expect(t.ended).toHaveBeenCalledTimes(1);
  });

  it('ends the stream when audio arrives much faster than real time', async () => {
    const t = streamSetup();
    await t.stream.start();
    for (let i = 0; i < 40; i++) t.stream.push(frame(8000)); // 10 s of audio in no time
    expect(t.log).toEqual([`!${SttStreamErrorCode.RATE_LIMITED}`]);
  });

  it('records stt-live usage per interval and for the remainder, with the audio token rate', async () => {
    const t = streamSetup();
    await t.stream.start();
    await jest.advanceTimersByTimeAsync(60_000);
    expect(t.rows).toEqual([{ userId: U1, meetingId: M1, operation: 'stt-live', model: 'fake-live', inputTokens: 1920, outputTokens: 0 }]);
    await jest.advanceTimersByTimeAsync(10_000);
    await t.stream.stop();
    await jest.advanceTimersByTimeAsync(0);
    expect(t.rows.at(-1)).toMatchObject({ operation: 'stt-live', inputTokens: 320 });
  });

  it('stops the stream with QUOTA_EXCEEDED when the budget runs out mid-stream', async () => {
    const t = streamSetup();
    t.usage.assertWithinBudget.mockRejectedValue(new QuotaExceededError(10, 10));
    await t.stream.start();
    await jest.advanceTimersByTimeAsync(60_000);
    expect(t.log).toEqual([`!${SttStreamErrorCode.QUOTA_EXCEEDED}`]);
    expect(t.opener.legs[0].closed).toBe(true);
  });

  it('keeps streaming when a usage row cannot be written', async () => {
    const t = streamSetup();
    t.usage.record.mockRejectedValue(new Error('db down'));
    await t.stream.start();
    await jest.advanceTimersByTimeAsync(60_000);
    expect(t.log).toEqual([]);
    t.stream.close();
  });

  it('re-checks consent on every usage tick and ends the stream with CONSENT_REQUIRED when it is gone', async () => {
    const assertConsent = jest.fn<() => Promise<void>>(async () => undefined);
    const t = streamSetup({ assertConsent });
    await t.stream.start();
    await jest.advanceTimersByTimeAsync(60_000);
    expect(assertConsent).toHaveBeenCalledTimes(1);
    expect(t.log).toEqual([]);
    assertConsent.mockRejectedValueOnce(new ForbiddenException());
    await jest.advanceTimersByTimeAsync(60_000);
    expect(t.log).toEqual([`!${SttStreamErrorCode.CONSENT_REQUIRED}`]);
    expect(t.opener.legs[0].closed).toBe(true);
  });

  it('keeps streaming when the consent re-check itself fails for another reason', async () => {
    const assertConsent = jest.fn<() => Promise<void>>(async () => Promise.reject(new Error('db down')));
    const t = streamSetup({ assertConsent });
    await t.stream.start();
    await jest.advanceTimersByTimeAsync(60_000);
    expect(t.log).toEqual([]);
    t.stream.close();
  });

  it('ends the stream with TOKEN_EXPIRED shortly after the access token expires', async () => {
    const t = streamSetup({ tokenExpiresAtMs: Date.now() + 30_000 });
    await t.stream.start();
    await jest.advanceTimersByTimeAsync(30_000);
    expect(t.log).toEqual([]); // small grace
    await jest.advanceTimersByTimeAsync(5_000);
    expect(t.log).toEqual([`!${SttStreamErrorCode.TOKEN_EXPIRED}`]);
    expect(t.opener.legs[0].closed).toBe(true);
  });

  it('start failure leaves nothing running', async () => {
    const t = streamSetup();
    t.opener.failOpen = new AiServiceUnavailableError('down');
    await expect(t.stream.start()).rejects.toBeInstanceOf(AiServiceUnavailableError);
    expect(t.ended).toHaveBeenCalledTimes(1);
  });
});

describe('SttStreamService', () => {
  function serviceSetup(extra: Partial<SttStreamOptions> = {}) {
    const opener = new FakeLiveOpener();
    const { usage, rows } = usageStub();
    const stt = {
      assertConsent: jest.fn<SttService['assertConsent']>(async () => undefined),
      ownMeetingId: jest.fn<SttService['ownMeetingId']>(async (_u, m) => m),
    };
    const service = new SttStreamService(stt as unknown as SttService, usage as unknown as UsageTracker, opener as unknown as GeminiLiveClient, { ...OPTIONS, ...extra });
    const log: string[] = [];
    const sink = (name: string) => ({ partial: () => undefined, final: () => undefined, fatal: (c: string) => log.push(`${name}:${c}`) });
    return { opener, stt, usage, rows, service, log, sink };
  }

  const refusal = async (promise: Promise<unknown>) => (await promise.then(() => null, (e: unknown) => e)) as SttStreamRefusal;

  it('opens a stream for a consenting user and attributes usage to their own meeting', async () => {
    const t = serviceSetup();
    const stream = await t.service.open(U1, { language: 'vi-VN', meeting_id: M1 }, t.sink('a'));
    expect(t.stt.ownMeetingId).toHaveBeenCalledWith(U1, M1);
    expect(t.opener.legs).toHaveLength(1);
    stream.close();
  });

  it.each([
    [{ language: 'fr-FR' }],
    [{}],
    [null],
    [{ language: 'vi-VN', meeting_id: 'not-a-uuid' }],
  ])('refuses an invalid start payload %j without touching Gemini', async (body) => {
    const t = serviceSetup();
    expect((await refusal(t.service.open(U1, body, t.sink('a')))).code).toBe(SttStreamErrorCode.VALIDATION_ERROR);
    expect(t.opener.legs).toHaveLength(0);
  });

  it('refuses without consent, when Gemini is unconfigured, and when the budget is spent', async () => {
    const t = serviceSetup();
    t.stt.assertConsent.mockRejectedValueOnce(new ForbiddenException());
    expect((await refusal(t.service.open(U1, { language: 'en-US' }, t.sink('a')))).code).toBe(SttStreamErrorCode.CONSENT_REQUIRED);
    t.opener.configured = false;
    expect((await refusal(t.service.open(U1, { language: 'en-US' }, t.sink('a')))).code).toBe(SttStreamErrorCode.AI_SERVICE_UNAVAILABLE);
    t.opener.configured = true;
    t.usage.assertWithinBudget.mockRejectedValueOnce(new QuotaExceededError(5, 5));
    expect((await refusal(t.service.open(U1, { language: 'en-US' }, t.sink('a')))).code).toBe(SttStreamErrorCode.QUOTA_EXCEEDED);
    t.opener.failOpen = new AiServiceUnavailableError('down');
    expect((await refusal(t.service.open(U1, { language: 'en-US' }, t.sink('a')))).code).toBe(SttStreamErrorCode.AI_SERVICE_UNAVAILABLE);
    expect(t.opener.legs).toHaveLength(0);
  });

  it('replaces the older stream of the same user with STREAM_REPLACED', async () => {
    const t = serviceSetup();
    const first = await t.service.open(U1, { language: 'vi-VN' }, t.sink('first'));
    const second = await t.service.open(U1, { language: 'vi-VN' }, t.sink('second'));
    expect(t.log).toEqual([`first:${SttStreamErrorCode.STREAM_REPLACED}`]);
    expect(t.opener.legs.map((l) => l.closed)).toEqual([true, false]);
    first.close();
    second.close();
  });

  it('a refused start never kills the same user\'s working stream', async () => {
    const t = serviceSetup();
    const first = await t.service.open(U1, { language: 'vi-VN' }, t.sink('first'));
    t.stt.assertConsent.mockRejectedValueOnce(new ForbiddenException());
    await refusal(t.service.open(U1, { language: 'vi-VN' }, t.sink('second')));
    t.usage.assertWithinBudget.mockRejectedValueOnce(new QuotaExceededError(1, 1));
    await refusal(t.service.open(U1, { language: 'vi-VN' }, t.sink('third')));
    expect(await refusal(t.service.open(U1, { language: 'xx' }, t.sink('fourth')))).toBeInstanceOf(SttStreamRefusal);
    expect(t.log).toEqual([]);
    expect(t.opener.legs[0].closed).toBe(false);
    first.close();
  });

  it('limits how often one user may start a stream', async () => {
    const t = serviceSetup();
    for (let i = 0; i < 5; i++) (await t.service.open(U1, { language: 'vi-VN' }, t.sink('a'))).close();
    expect((await refusal(t.service.open(U1, { language: 'vi-VN' }, t.sink('a')))).code).toBe(SttStreamErrorCode.RATE_LIMITED);
    // Other users are unaffected, and an invalid payload does not count.
    (await t.service.open('00000000-0000-4000-8000-000000000002', { language: 'vi-VN' }, t.sink('b'))).close();
  });

  it('refuses a start beyond the global limit of concurrent Live sessions', async () => {
    const t = serviceSetup({ maxConcurrent: 1 });
    const a = await t.service.open(U1, { language: 'vi-VN' }, t.sink('a'));
    const other = '00000000-0000-4000-8000-000000000002';
    expect((await refusal(t.service.open(other, { language: 'vi-VN' }, t.sink('b')))).code).toBe(SttStreamErrorCode.AI_SERVICE_UNAVAILABLE);
    // The same user replacing their own stream is not an extra session.
    const again = await t.service.open(U1, { language: 'vi-VN' }, t.sink('a2'));
    a.close();
    again.close();
  });

  it('lets a different user stream at the same time', async () => {
    const t = serviceSetup();
    const a = await t.service.open(U1, { language: 'vi-VN' }, t.sink('a'));
    const b = await t.service.open('00000000-0000-4000-8000-000000000002', { language: 'vi-VN' }, t.sink('b'));
    expect(t.log).toEqual([]);
    a.close();
    b.close();
  });

  it('a start that is superseded while its Live session is still opening is refused with STREAM_REPLACED', async () => {
    const t = serviceSetup();
    let release!: () => void;
    t.opener.openGate = new Promise<void>((r) => (release = r));
    const slow = t.service.open(U1, { language: 'vi-VN' }, t.sink('slow'));
    await new Promise((r) => setImmediate(r)); // let the slow start register and begin opening
    t.opener.openGate = null;
    const fast = await t.service.open(U1, { language: 'vi-VN' }, t.sink('fast'));
    release();
    expect((await refusal(slow)).code).toBe(SttStreamErrorCode.STREAM_REPLACED);
    // Only the newer stream's Live session survives.
    expect(t.opener.legs.filter((l) => !l.closed)).toHaveLength(1);
    fast.close();
  });

  it('passes the token expiry on to the stream', async () => {
    jest.useFakeTimers();
    try {
      const t = serviceSetup();
      const stream = await t.service.open(U1, { language: 'vi-VN' }, t.sink('a'), Math.floor(Date.now() / 1000) + 10);
      await jest.advanceTimersByTimeAsync(16_000);
      expect(t.log).toEqual([`a:${SttStreamErrorCode.TOKEN_EXPIRED}`]);
      stream.close();
    } finally {
      jest.useRealTimers();
    }
  });
});
