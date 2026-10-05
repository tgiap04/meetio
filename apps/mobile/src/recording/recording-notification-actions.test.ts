import {
  NOTIFICATION_ACTION_EVENT,
  notificationForPhase,
  wireRecordingNotification,
} from './recording-notification-actions';
import { resetRecordingStore, useRecordingStore } from './recording.store';

function fakeEmitter() {
  const listeners = new Map<string, (id: string) => void>();
  return {
    addListener: jest.fn((event: string, fn: (id: string) => void) => {
      listeners.set(event, fn);
      return { remove: () => listeners.delete(event) };
    }),
    tap: (id: string) => listeners.get(NOTIFICATION_ACTION_EVENT)?.(id),
    listening: () => listeners.has(NOTIFICATION_ACTION_EVENT),
  };
}

const flush = () => new Promise((r) => setImmediate(r));

describe('notificationForPhase', () => {
  it('offers Pause + End while recording and Resume + End while paused', () => {
    expect(notificationForPhase('recording').actions.map((a) => a.id)).toEqual(['pause', 'end']);
    expect(notificationForPhase('paused').actions.map((a) => a.id)).toEqual(['resume', 'end']);
  });

  it('says why when the pause came from a phone call', () => {
    expect(notificationForPhase('paused', 'call').taskDesc).toMatch(/cuộc gọi/);
    expect(notificationForPhase('paused').taskDesc).not.toMatch(/cuộc gọi/);
  });

  it.each(['idle', 'ending'] as const)('offers no buttons while %s', (phase) => {
    expect(notificationForPhase(phase).actions).toEqual([]);
  });
});

describe('wireRecordingNotification', () => {
  let session: { pause: jest.Mock; resume: jest.Mock; end: jest.Mock };
  let emitter: ReturnType<typeof fakeEmitter>;
  let update: jest.Mock;
  let unwire: () => void;

  beforeEach(() => {
    resetRecordingStore();
    session = { pause: jest.fn(async () => {}), resume: jest.fn(async () => {}), end: jest.fn(async () => {}) };
    emitter = fakeEmitter();
    update = jest.fn(async () => {});
    unwire = wireRecordingNotification({ session, store: useRecordingStore, emitter, update });
  });
  afterEach(() => unwire());

  it('routes each button to the matching session call', async () => {
    useRecordingStore.setState({ phase: 'recording' });
    emitter.tap('pause');
    await flush();
    useRecordingStore.setState({ phase: 'paused' });
    emitter.tap('resume');
    await flush();
    emitter.tap('end');
    await flush();
    expect(session.pause).toHaveBeenCalledTimes(1);
    expect(session.resume).toHaveBeenCalledTimes(1);
    expect(session.end).toHaveBeenCalledTimes(1);
  });

  it('ignores a button that no longer fits the phase (stale notification)', async () => {
    useRecordingStore.setState({ phase: 'paused' });
    emitter.tap('pause');
    useRecordingStore.setState({ phase: 'idle' });
    emitter.tap('end');
    emitter.tap('bogus');
    await flush();
    expect(session.pause).not.toHaveBeenCalled();
    expect(session.end).not.toHaveBeenCalled();
  });

  it('passes every allowed tap to the session, which runs them in order', async () => {
    // The session serializes transitions and re-checks the phase on its turn; this layer only
    // filters taps that no longer match the notification the user saw.
    useRecordingStore.setState({ phase: 'recording' });
    emitter.tap('pause');
    emitter.tap('end');
    await flush();
    expect(session.pause).toHaveBeenCalledTimes(1);
    expect(session.end).toHaveBeenCalledTimes(1);
  });

  it('surfaces a failed action as a problem instead of an unhandled rejection', async () => {
    useRecordingStore.setState({ phase: 'recording' });
    session.end.mockRejectedValueOnce(new Error('Unsaved segments remain'));
    emitter.tap('end');
    await flush();
    expect(useRecordingStore.getState().problem).toMatch(/thông báo/);
  });

  it('redraws the notification on every phase change, and only then', () => {
    useRecordingStore.setState({ phase: 'recording' });
    useRecordingStore.setState({ volume: 0.5 });
    useRecordingStore.setState({ phase: 'paused' });
    expect(update.mock.calls.map(([c]) => c.actions.map((a: { id: string }) => a.id))).toEqual([
      ['pause', 'end'],
      ['resume', 'end'],
    ]);
  });

  it('redraws when the pause reason changes within the same phase', () => {
    useRecordingStore.setState({ phase: 'paused' });
    useRecordingStore.setState({ pausedBy: 'call' });
    expect(update).toHaveBeenLastCalledWith(notificationForPhase('paused', 'call'));
  });

  it('unwires both the button listener and the store subscription', () => {
    unwire();
    expect(emitter.listening()).toBe(false);
    useRecordingStore.setState({ phase: 'recording' });
    expect(update).not.toHaveBeenCalled();
  });
});
