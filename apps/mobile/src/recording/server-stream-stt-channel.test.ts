import { createStreamChannel, type StreamSocket } from './server-stream-stt-channel';
import { StreamStartError, type StreamChannelEvents } from './server-stream-stt-ports';

/** A scripted socket: the test decides how the handshake and acks go. */
class FakeSocket implements StreamSocket {
  private listeners = new Map<string, ((p: unknown) => void)[]>();
  readonly emitted: { event: string; payload: unknown }[] = [];
  disconnected = false;
  acks: Record<string, unknown | Error> = { stt_start: { ok: true }, stt_stop: { ok: true } };

  on(event: string, listener: (p: unknown) => void) {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]);
  }
  once(event: string, listener: (p: unknown) => void) {
    const wrapper = (p: unknown) => {
      this.listeners.set(event, (this.listeners.get(event) ?? []).filter((l) => l !== wrapper));
      listener(p);
    };
    this.on(event, wrapper);
  }
  emit(event: string, payload: ArrayBuffer) {
    this.emitted.push({ event, payload });
  }
  async emitWithAck(event: string, payload: unknown) {
    this.emitted.push({ event, payload });
    const ack = this.acks[event];
    if (ack instanceof Error) throw ack;
    return ack;
  }
  disconnect() {
    this.disconnected = true;
  }
  fire(event: string, payload?: unknown) {
    [...(this.listeners.get(event) ?? [])].forEach((l) => l(payload));
  }
}

const events = () => {
  const seen: string[] = [];
  const e: StreamChannelEvents = {
    onPartial: (t) => seen.push(`partial:${t}`),
    onFinal: (t) => seen.push(`final:${t}`),
    onFatal: (c) => seen.push(`fatal:${c}`),
    onDown: () => seen.push('down'),
  };
  return { e, seen };
};

function setup(script: (socket: FakeSocket, attempt: number) => void = (s) => queueMicrotask(() => s.fire('connect'))) {
  const sockets: FakeSocket[] = [];
  const refreshToken = jest.fn(async () => undefined);
  const channel = createStreamChannel({
    connect: () => {
      const s = new FakeSocket();
      sockets.push(s);
      script(s, sockets.length);
      return s;
    },
    refreshToken,
    connectTimeoutMs: 50,
    ackTimeoutMs: 50,
  });
  return { channel, sockets, refreshToken };
}

describe('stream channel', () => {
  it('connects, starts the stream with the language and meeting, and relays server events', async () => {
    const t = setup();
    const { e, seen } = events();
    await t.channel.open({ language: 'vi-VN', meetingId: 'm1' }, e);
    expect(t.sockets[0].emitted[0]).toEqual({ event: 'stt_start', payload: { language: 'vi-VN', meeting_id: 'm1' } });
    t.sockets[0].fire('stt_partial', { text: 'xin ch' });
    t.sockets[0].fire('stt_final', { text: 'xin chào' });
    t.sockets[0].fire('stt_error', { code: 'QUOTA_EXCEEDED' });
    t.sockets[0].fire('stt_partial', { nope: 1 });
    t.sockets[0].fire('stt_final', null);
    expect(seen).toEqual(['partial:xin ch', 'final:xin chào', 'fatal:QUOTA_EXCEEDED']);
  });

  it('sends audio frames and acks a stop', async () => {
    const t = setup();
    await t.channel.open({ language: 'en-US' }, events().e);
    const frame = new ArrayBuffer(8);
    t.channel.send(frame);
    await t.channel.end();
    expect(t.sockets[0].emitted.slice(1)).toEqual([
      { event: 'stt_audio', payload: frame },
      { event: 'stt_stop', payload: undefined },
    ]);
  });

  it('rejects with the server code when stt_start is refused, and drops the socket', async () => {
    const t = setup((s) => {
      s.acks.stt_start = { ok: false, error: { code: 'CONSENT_REQUIRED', message: 'x' } };
      queueMicrotask(() => s.fire('connect'));
    });
    await expect(t.channel.open({ language: 'vi-VN' }, events().e)).rejects.toMatchObject({ code: 'CONSENT_REQUIRED' });
    expect(t.sockets[0].disconnected).toBe(true);
  });

  it('rejects as NETWORK when no ack arrives', async () => {
    const t = setup((s) => {
      s.acks.stt_start = new Error('timeout');
      queueMicrotask(() => s.fire('connect'));
    });
    await expect(t.channel.open({ language: 'vi-VN' }, events().e)).rejects.toMatchObject({ code: 'NETWORK' });
  });

  it('refreshes the token once and retries when the handshake says it expired', async () => {
    const t = setup((s, attempt) => {
      queueMicrotask(() => (attempt === 1 ? s.fire('connect_error', { data: { code: 'TOKEN_EXPIRED' } }) : s.fire('connect')));
    });
    await t.channel.open({ language: 'vi-VN' }, events().e);
    expect(t.refreshToken).toHaveBeenCalledTimes(1);
    expect(t.sockets).toHaveLength(2);
  });

  it('gives up as UNAUTHORIZED when the refresh fails, and as the server code for other handshake errors', async () => {
    const expired = setup((s) => queueMicrotask(() => s.fire('connect_error', { data: { code: 'TOKEN_EXPIRED' } })));
    expired.refreshToken.mockRejectedValue(new Error('revoked'));
    await expect(expired.channel.open({ language: 'vi-VN' }, events().e)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });

    const refused = setup((s) => queueMicrotask(() => s.fire('connect_error', { data: { code: 'UNAUTHORIZED' } })));
    await expect(refused.channel.open({ language: 'vi-VN' }, events().e)).rejects.toBeInstanceOf(StreamStartError);
    expect(refused.refreshToken).not.toHaveBeenCalled();
  });

  it('times out a handshake that never answers', async () => {
    const t = setup(() => undefined);
    await expect(t.channel.open({ language: 'vi-VN' }, events().e)).rejects.toMatchObject({ code: 'NETWORK' });
  });

  it('reports a drop, but not the disconnect it causes itself', async () => {
    const t = setup();
    const { e, seen } = events();
    await t.channel.open({ language: 'vi-VN' }, e);
    t.sockets[0].fire('disconnect');
    expect(seen).toEqual(['down']);
    t.channel.close();
    t.sockets[0].fire('disconnect');
    t.sockets[0].fire('stt_final', { text: 'late' });
    expect(seen).toEqual(['down']);
  });

  it('closes the previous socket when opened again', async () => {
    const t = setup();
    await t.channel.open({ language: 'vi-VN' }, events().e);
    await t.channel.open({ language: 'vi-VN' }, events().e);
    expect(t.sockets[0].disconnected).toBe(true);
    expect(t.sockets[1].disconnected).toBe(false);
  });
});
