/**
 * The realtime channel's contract with api-spec §8, against a scriptable socket.io client:
 * join on every (re)connect, ack → handler, fresh token on every attempt, and recovery from an
 * expired token (handshake refusal or server disconnect), which socket.io will not retry itself.
 */
type Handler = (...args: never[]) => void;

class FakeSocket {
  handlers = new Map<string, Handler[]>();
  emitted: { event: string; payload: unknown; ack?: (a: unknown) => void }[] = [];
  connected = false;
  connectCalls = 0;
  disconnected = false;
  on(event: string, handler: Handler) {
    this.handlers.set(event, [...(this.handlers.get(event) ?? []), handler]);
    return this;
  }
  emit(event: string, payload: unknown, ack?: (a: unknown) => void) {
    this.emitted.push({ event, payload, ack });
  }
  fire(event: string, ...args: unknown[]) {
    for (const h of this.handlers.get(event) ?? []) (h as (...a: unknown[]) => void)(...args);
  }
  connect() {
    this.connectCalls += 1;
  }
  disconnect() {
    this.disconnected = true;
  }
  listenerEvents() {
    return [...this.handlers.keys()];
  }
  removeAllListeners() {
    this.handlers.clear();
  }
}

let mockSocket: FakeSocket;
let mockIoArgs: { url: string; options: { auth: (cb: (d: unknown) => void) => void } } | null = null;
jest.mock('socket.io-client', () => ({
  io: (url: string, options: { auth: (cb: (d: unknown) => void) => void }) => {
    mockIoArgs = { url, options };
    return mockSocket;
  },
}));
const mockRefresh = jest.fn(async () => 'fresh');
jest.mock('../api/axios-client', () => ({ refreshAccessToken: () => mockRefresh() }));

import { createMeetingSocket, type RealtimeHandlers } from './meeting-socket';
import { useSessionStore } from '../store/session.store';

function setup() {
  mockSocket = new FakeSocket();
  const calls: string[] = [];
  const handlers: RealtimeHandlers = {
    onReady: (id) => void calls.push(`ready:${id}`),
    onAck: (id, seq) => void calls.push(`ack:${id}:${seq}`),
    onSegmentError: (id, seq, code) => void calls.push(`error:${id}:${seq}:${code}`),
    onDown: () => void calls.push('down'),
  };
  const port = createMeetingSocket(handlers);
  const connectAndJoin = (ok = true) => {
    mockSocket.connected = true;
    mockSocket.fire('connect');
    const join = mockSocket.emitted.filter((e) => e.event === 'join_meeting').at(-1)!;
    join.ack!(ok ? { ok: true } : { ok: false, error: { code: 'MEETING_NOT_FOUND', message: 'x' } });
  };
  return { port, calls, connectAndJoin };
}
const segment = { seq: 1, text: 'a', started_at_ms: 0, ended_at_ms: 1 };
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('meeting socket', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useSessionStore.setState({ accessToken: 'token-1' });
  });

  it('connects to /meeting-room reading the CURRENT token on every attempt', () => {
    const { port } = setup();
    port.open('m1');
    expect(mockIoArgs!.url.endsWith('/meeting-room')).toBe(true);
    const tokens: unknown[] = [];
    mockIoArgs!.options.auth((d) => tokens.push(d));
    useSessionStore.setState({ accessToken: 'token-2' });
    mockIoArgs!.options.auth((d) => tokens.push(d));
    expect(tokens).toEqual([{ token: 'token-1' }, { token: 'token-2' }]);
  });

  it('joins the meeting on connect and reports ready only once the server accepted', () => {
    const { port, calls, connectAndJoin } = setup();
    port.open('m1');
    expect(port.isReady('m1')).toBe(false);
    connectAndJoin();
    expect(mockSocket.emitted[0]).toMatchObject({ event: 'join_meeting', payload: { meeting_id: 'm1' } });
    expect(calls).toEqual(['ready:m1']);
    expect(port.isReady('m1')).toBe(true);
    expect(port.isReady('other')).toBe(false);
  });

  it('a refused join is not ready — segments are not sent into the void', () => {
    const { port, calls, connectAndJoin } = setup();
    port.open('m1');
    connectAndJoin(false);
    port.send('m1', segment);
    expect(port.isReady('m1')).toBe(false);
    expect(calls).toEqual([]);
    expect(mockSocket.emitted.filter((e) => e.event === 'transcript_segment')).toEqual([]);
  });

  it('sends segments once joined and passes each ack / error to the worker', () => {
    const { port, calls, connectAndJoin } = setup();
    port.open('m1');
    connectAndJoin();
    port.send('m1', segment);
    mockSocket.fire('segment_ack', { seq: 1 });
    mockSocket.fire('segment_error', { seq: 2, code: 'RATE_LIMITED', message: 'x' });
    expect(mockSocket.emitted.at(-1)).toMatchObject({ event: 'transcript_segment', payload: segment });
    expect(calls).toEqual(['ready:m1', 'ack:m1:1', 'error:m1:2:RATE_LIMITED']);
  });

  it('rejoins after a reconnect', () => {
    const { port, connectAndJoin } = setup();
    port.open('m1');
    connectAndJoin();
    mockSocket.connected = false;
    mockSocket.fire('disconnect', 'transport close');
    expect(port.isReady('m1')).toBe(false);
    connectAndJoin();
    expect(mockSocket.emitted.filter((e) => e.event === 'join_meeting')).toHaveLength(2);
    expect(port.isReady('m1')).toBe(true);
  });

  it('an expired token at the handshake refreshes, then reconnects', async () => {
    const { port, calls } = setup();
    port.open('m1');
    mockSocket.fire('connect_error', Object.assign(new Error('x'), { data: { code: 'TOKEN_EXPIRED' } }));
    await flush();
    expect(calls).toEqual(['down']);
    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(mockSocket.connectCalls).toBe(1);
  });

  it('a server-initiated disconnect (not auto-retried by socket.io) refreshes and reconnects', async () => {
    const { port, connectAndJoin } = setup();
    port.open('m1');
    connectAndJoin();
    mockSocket.fire('disconnect', 'io server disconnect');
    await flush();
    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(mockSocket.connectCalls).toBe(1);
  });

  it('switching meetings leaves the old room and joins the new one on the same connection', () => {
    const { port, connectAndJoin } = setup();
    port.open('m1');
    connectAndJoin();
    port.open('m2');
    expect(mockSocket.emitted.map((e) => e.event)).toEqual(['join_meeting', 'leave_meeting', 'join_meeting']);
    expect(mockSocket.emitted[1].payload).toEqual({ meeting_id: 'm1' });
    expect(port.isReady('m1')).toBe(false);
  });

  it('close disconnects and forgets the meeting', () => {
    const { port, connectAndJoin } = setup();
    port.open('m1');
    connectAndJoin();
    port.close();
    expect(mockSocket.disconnected).toBe(true);
    expect(port.isReady('m1')).toBe(false);
  });
});

describe('meeting socket after the server stopped translating (Phase 21)', () => {
  it('listens for no translation events — translation is on the device now', () => {
    jest.clearAllMocks();
    useSessionStore.setState({ accessToken: 'token-1' });
    const { port } = setup();
    port.open('m1'); // listeners are registered when the socket is created
    expect(mockSocket.listenerEvents().filter((e) => e.includes('translat'))).toEqual([]);
    expect(mockSocket.listenerEvents()).toEqual(expect.arrayContaining(['segment_ack', 'segment_error']));
  });
});
