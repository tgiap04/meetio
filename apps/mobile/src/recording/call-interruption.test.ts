import { createCallInterruption } from './call-interruption';
import { resetRecordingStore, useRecordingStore } from './recording.store';

const flush = () => new Promise((r) => setImmediate(r));

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

/**
 * A session double with the real session's contract: transitions run one at a time, each reads
 * the phase on its own turn, and `pause` reports whether it was the one that paused.
 */
function fakeSession() {
  let queue: Promise<unknown> = Promise.resolve();
  const gates: { pause?: Promise<void> } = {};
  const serial = <T,>(fn: () => Promise<T>) => {
    const run = queue.then(fn, fn);
    queue = run.catch(() => undefined);
    return run;
  };
  return {
    gates,
    pause: jest.fn(() =>
      serial(async () => {
        if (useRecordingStore.getState().phase !== 'recording') return false;
        await gates.pause;
        useRecordingStore.setState({ phase: 'paused' });
        return true;
      }),
    ),
    resume: jest.fn(() =>
      serial(async () => {
        if (useRecordingStore.getState().phase !== 'paused') return;
        useRecordingStore.setState({ phase: 'recording' });
      }),
    ),
  };
}

describe('createCallInterruption', () => {
  let session: ReturnType<typeof fakeSession>;
  let emit: (busy: boolean) => void;
  let watching: boolean;
  let dispose: () => void;

  /** Starts a meeting with the phone idle — the watcher's first report is the baseline. */
  function startRecording(phoneBusyAtStart = false) {
    useRecordingStore.setState({ phase: 'recording' });
    emit(phoneBusyAtStart);
  }

  beforeEach(() => {
    resetRecordingStore();
    watching = false;
    session = fakeSession();
    const watch = jest.fn((listener: (busy: boolean) => void) => {
      watching = true;
      emit = listener;
      return () => {
        watching = false;
      };
    });
    dispose = createCallInterruption({ session, store: useRecordingStore, watch });
  });
  afterEach(() => dispose());

  it('watches the phone only while a meeting is open', () => {
    expect(watching).toBe(false);
    useRecordingStore.setState({ phase: 'recording' });
    expect(watching).toBe(true);
    useRecordingStore.setState({ phase: 'paused' });
    expect(watching).toBe(true);
    useRecordingStore.setState({ phase: 'ending' });
    expect(watching).toBe(false);
  });

  it('pauses on an incoming call and resumes once it ends', async () => {
    startRecording();
    emit(true);
    await flush();
    expect(useRecordingStore.getState()).toMatchObject({ phase: 'paused', pausedBy: 'call' });

    emit(false);
    await flush();
    expect(session.resume).toHaveBeenCalledTimes(1);
    expect(useRecordingStore.getState()).toMatchObject({ phase: 'recording', pausedBy: null });
  });

  it('ignores a call already in progress when the recording starts', async () => {
    startRecording(true);
    await flush();
    expect(session.pause).not.toHaveBeenCalled();
    emit(false);
    emit(true); // a NEW call does pause
    await flush();
    expect(session.pause).toHaveBeenCalledTimes(1);
  });

  it('leaves a pause the user chose alone when a call comes and goes', async () => {
    startRecording();
    useRecordingStore.setState({ phase: 'paused' });
    emit(true);
    emit(false);
    await flush();
    expect(session.pause).not.toHaveBeenCalled();
    expect(session.resume).not.toHaveBeenCalled();
  });

  it('does not claim a pause the user got in first while the call pause was queued', async () => {
    startRecording();
    const flushing = deferred();
    session.gates.pause = flushing.promise;
    void session.pause(); // the user's pause, still flushing to disk
    emit(true); // the call's pause queues behind it
    flushing.resolve();
    await flush();
    expect(useRecordingStore.getState()).toMatchObject({ phase: 'paused', pausedBy: null });
    emit(false);
    await flush();
    expect(session.resume).not.toHaveBeenCalled();
  });

  it('resumes straight away when a short call ended before its pause finished', async () => {
    startRecording();
    const flushing = deferred();
    session.gates.pause = flushing.promise;
    emit(true);
    emit(false); // call over while the pause is still writing
    flushing.resolve();
    await flush();
    expect(session.resume).toHaveBeenCalledTimes(1);
    expect(useRecordingStore.getState()).toMatchObject({ phase: 'recording', pausedBy: null });
  });

  it('respects a user who resumes during the call', async () => {
    startRecording();
    emit(true);
    await flush();
    await session.resume(); // user tapped Tiếp tục mid-call
    expect(useRecordingStore.getState().pausedBy).toBeNull();
    emit(false);
    await flush();
    expect(session.resume).toHaveBeenCalledTimes(1);
  });

  it('reports a failed automatic resume and stops promising one', async () => {
    startRecording();
    emit(true);
    await flush();
    session.resume.mockRejectedValueOnce(new Error('mic busy'));
    emit(false);
    await flush();
    expect(useRecordingStore.getState().problem).toMatch(/cuộc gọi/i);
    expect(useRecordingStore.getState().pausedBy).toBeNull();
  });

  it('stops watching on dispose', () => {
    useRecordingStore.setState({ phase: 'recording' });
    dispose();
    expect(watching).toBe(false);
  });
});
