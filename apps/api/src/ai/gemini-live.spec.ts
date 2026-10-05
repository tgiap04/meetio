import { jest } from '@jest/globals';
import { GeminiLiveClient, type LiveApi, type LiveHandlers } from './gemini-live.js';
import { GeminiKeyPool } from './gemini-key-pool.js';
import { AiServiceUnavailableError } from './ai-errors.js';
import type { LiveServerMessage } from '@google/genai';

// Only the fields under test are filled in; the SDK's class also carries convenience getters.
const message = (m: object) => m as LiveServerMessage;

type Callbacks = Parameters<LiveApi['connect']>[0]['callbacks'];

function fakeApi(name: string, behaviour: () => Promise<void> = async () => undefined) {
  const sent: unknown[] = [];
  let callbacks!: Callbacks;
  let params!: Parameters<LiveApi['connect']>[0];
  const closed = jest.fn();
  const api: LiveApi & { name: string } = {
    name,
    connect: async (p) => {
      await behaviour();
      params = p;
      callbacks = p.callbacks;
      return { sendRealtimeInput: (m: unknown) => void sent.push(m), close: closed } as never;
    },
  };
  return { api, sent, closed, callbacks: () => callbacks, params: () => params };
}

const handlers = () => {
  const h = { onInterim: jest.fn<LiveHandlers['onInterim']>(), onFinal: jest.fn<LiveHandlers['onFinal']>(), onGoAway: jest.fn<LiveHandlers['onGoAway']>(), onClose: jest.fn<LiveHandlers['onClose']>() };
  return h;
};

const client = (apis: LiveApi[]) =>
  new GeminiLiveClient(apis.length ? new GeminiKeyPool(apis, { defaultCooldownMs: 1000 }) : null, { model: 'live-model' });

describe('GeminiLiveClient', () => {
  it('opens a TEXT-only verbatim transcription session for the language and relays transcripts', async () => {
    const f = fakeApi('a');
    const h = handlers();
    const session = await client([f.api]).open('vi-VN', h);
    expect(f.params()).toMatchObject({
      model: 'live-model',
      config: { responseModalities: ['TEXT'], inputAudioTranscription: { languageCodes: ['vi-VN'], mode: 'VERBATIM' } },
    });
    f.callbacks().onmessage(message({ serverContent: { interimInputTranscription: { text: 'xin ch' } } }));
    f.callbacks().onmessage(message({ serverContent: { inputTranscription: { text: 'xin chào' } } }));
    f.callbacks().onmessage(message({ serverContent: { inputTranscription: { text: '' } } }));
    f.callbacks().onmessage(message({ goAway: { timeLeft: '30s' } }));
    expect(h.onInterim).toHaveBeenCalledWith('xin ch');
    expect(h.onFinal).toHaveBeenCalledTimes(1);
    expect(h.onFinal).toHaveBeenCalledWith('xin chào');
    expect(h.onGoAway).toHaveBeenCalledTimes(1);

    session.sendAudio(Buffer.from([1, 2, 3, 4]));
    session.endAudio();
    session.close();
    expect(f.sent).toEqual([{ audio: { data: 'AQIDBA==', mimeType: 'audio/pcm;rate=16000' } }, { audioStreamEnd: true }]);
    expect(f.closed).toHaveBeenCalled();
  });

  it('reports a close as a failure unless it was clean or requested', async () => {
    const f = fakeApi('a');
    const h = handlers();
    await client([f.api]).open('en-US', h);
    f.callbacks().onclose?.({ code: 1011 } as CloseEvent);
    expect(h.onClose).toHaveBeenCalledWith(true);

    const g = fakeApi('b');
    const h2 = handlers();
    const s = await client([g.api]).open('en-US', h2);
    s.close();
    g.callbacks().onclose?.({ code: 1005 } as CloseEvent);
    expect(h2.onClose).toHaveBeenCalledWith(false);
  });

  it('moves to the next key when one answers 429, resting the first', async () => {
    const limited = fakeApi('a', async () => Promise.reject(Object.assign(new Error('quota'), { status: 429 })));
    const ok = fakeApi('b');
    const pool = new GeminiKeyPool<LiveApi>([limited.api, ok.api], { defaultCooldownMs: 60_000 });
    await new GeminiLiveClient(pool, { model: 'live-model' }).open('vi-VN', handlers());
    expect(ok.params()).toBeDefined();
    // Key 1 is resting: the pool now hands out only key 2.
    expect([pool.acquire()?.index, pool.acquire()?.index]).toEqual([2, 2]);
  });

  it('fails with AI_SERVICE_UNAVAILABLE when unconfigured or when connecting fails otherwise', async () => {
    expect(client([]).isConfigured()).toBe(false);
    await expect(client([]).open('vi-VN', handlers())).rejects.toBeInstanceOf(AiServiceUnavailableError);
    const broken = fakeApi('a', async () => Promise.reject(new Error('socket hang up')));
    await expect(client([broken.api]).open('vi-VN', handlers())).rejects.toBeInstanceOf(AiServiceUnavailableError);
  });

  it('drops a key Gemini rejects as invalid', async () => {
    const bad = fakeApi('a', async () => Promise.reject(Object.assign(new Error('API key not valid'), { status: 400 })));
    const ok = fakeApi('b');
    await client([bad.api, ok.api]).open('vi-VN', handlers());
    expect(ok.params()).toBeDefined();
  });

  it('gives up on a socket that fails before opening, and on a connect that never settles', async () => {
    const failing: LiveApi = {
      connect: async (p) => {
        p.callbacks.onerror?.({} as ErrorEvent);
        return new Promise(() => undefined);
      },
    };
    await expect(client([failing]).open('vi-VN', handlers())).rejects.toBeInstanceOf(AiServiceUnavailableError);

    jest.useFakeTimers();
    try {
      const hanging: LiveApi = { connect: () => new Promise(() => undefined) };
      const pending = new GeminiLiveClient(new GeminiKeyPool([hanging], { defaultCooldownMs: 1000 }), { model: 'm', connectTimeoutMs: 5000 }).open('vi-VN', handlers());
      const assertion = expect(pending).rejects.toBeInstanceOf(AiServiceUnavailableError);
      await jest.advanceTimersByTimeAsync(5000);
      await assertion;
    } finally {
      jest.useRealTimers();
    }
  });

  it('closes a session whose connect settles only after the client gave up', async () => {
    jest.useFakeTimers();
    try {
      const closed = jest.fn();
      let finish!: (s: unknown) => void;
      const slow: LiveApi = { connect: () => new Promise((r) => (finish = r)) as never };
      const pending = new GeminiLiveClient(new GeminiKeyPool([slow], { defaultCooldownMs: 1000 }), { model: 'm', connectTimeoutMs: 100 }).open('vi-VN', handlers());
      const assertion = expect(pending).rejects.toBeInstanceOf(AiServiceUnavailableError);
      await jest.advanceTimersByTimeAsync(100);
      await assertion;
      finish({ close: closed, sendRealtimeInput: () => undefined });
      await jest.advanceTimersByTimeAsync(0);
      expect(closed).toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });
});
