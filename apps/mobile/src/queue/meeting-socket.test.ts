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
import { resetRecordingStore, useRecordingStore } from '../recording/recording.store';

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

describe('meeting socket translation events (Phase 09)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useSessionStore.setState({ accessToken: 'token-1' });
    resetRecordingStore();
    useRecordingStore.setState({ meetingId: 'm1' });
  });

  it('stores segment_translated by seq for the open meeting', () => {
    const { port, connectAndJoin } = setup();
    port.open('m1');
    connectAndJoin();
    mockSocket.fire('segment_translated', { meeting_id: 'm1', seq: 4, translated_text: 'hello', translated_to: 'en-US' });
    expect(useRecordingStore.getState().translations[4]).toEqual({ status: 'done', text: 'hello', to: 'en-US' });
  });

  it('stores segment_translation_failed as a failure marker', () => {
    const { port, connectAndJoin } = setup();
    port.open('m1');
    connectAndJoin();
    mockSocket.fire('segment_translation_failed', { meeting_id: 'm1', seq: 5 });
    expect(useRecordingStore.getState().translations[5]).toEqual({ status: 'failed' });
  });

  it('ignores malformed payloads from the wire', () => {
    const { port, connectAndJoin } = setup();
    port.open('m1');
    connectAndJoin();
    mockSocket.fire('segment_translated', { meeting_id: 'm1', seq: '4', translated_text: 'x', translated_to: 'en-US' });
    mockSocket.fire('segment_translated', { meeting_id: 'm1', seq: 4, translated_text: 7, translated_to: 'en-US' });
    mockSocket.fire('segment_translated', null);
    mockSocket.fire('segment_translation_failed', { meeting_id: 'm1', seq: 'x' });
    expect(useRecordingStore.getState().translations).toEqual({});
  });

  it('ignores events once the socket has been closed or moved to another meeting', () => {
    const { port, connectAndJoin } = setup();
    port.open('m2');
    connectAndJoin();
    // The store still shows m1 (m2 is a different room): nothing is applied to it.
    mockSocket.fire('segment_translated', { meeting_id: 'm2', seq: 1, translated_text: 'x', translated_to: 'en-US' });
    expect(useRecordingStore.getState().translations).toEqual({});
  });

  it('drops a late event of the previous meeting on a reused socket, and one with no meeting_id', () => {
    const { port, connectAndJoin } = setup();
    port.open('m1');
    connectAndJoin();
    mockSocket.fire('segment_translated', { meeting_id: 'old', seq: 2, translated_text: 'late', translated_to: 'en-US' });
    mockSocket.fire('segment_translated', { seq: 2, translated_text: 'no id', translated_to: 'en-US' });
    mockSocket.fire('segment_translation_failed', { meeting_id: 'old', seq: 3 });
    mockSocket.fire('segment_translation_failed', { seq: 3 });
    expect(useRecordingStore.getState().translations).toEqual({});
  });
});

