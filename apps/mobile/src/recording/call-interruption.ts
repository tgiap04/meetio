import type { RecordingState } from './recording.store';

interface SessionControls {
  /** Resolves true only when this call itself paused the meeting. */
  pause(): Promise<boolean>;
  resume(): Promise<void>;
}

interface StoreLike {
  getState(): Pick<RecordingState, 'phase' | 'pausedBy'>;
  setState(partial: Partial<RecordingState>): void;
  subscribe(listener: (state: RecordingState, prev: RecordingState) => void): () => void;
}

export interface CallInterruptionDeps {
  session: SessionControls;
  store: StoreLike;
  /** Starts watching ringing/in-call state; returns the stop function (modules/call-state). */
  watch: (listener: (busy: boolean) => void) => () => void;
}

const RESUME_FAILED = 'Cuộc gọi đã xong nhưng chưa ghi tiếp được. Bấm Tiếp tục để ghi.';
const active = (phase: RecordingState['phase']) => phase === 'recording' || phase === 'paused';

/**
 * Pauses the recording when a call starts and resumes it when the call ends — but only a pause the
 * call itself caused (`session.pause()` reports whether it did; the session runs transitions one at
 * a time, so a user pause that got there first makes ours a no-op). A user who resumes mid-call has
 * decided, and the call ending changes nothing.
 *
 * A call already in progress when watching starts is ignored: starting to record during a call is
 * a deliberate choice, and pausing the very recording the user just started would undo it.
 */
export function createCallInterruption({ session, store, watch }: CallInterruptionDeps): () => void {
  let stopWatching: (() => void) | null = null;
  let callActive = false;
  let sawFirstState = false;

  const resumeAfterCall = () => {
    session.resume().catch(() => store.setState({ pausedBy: null, problem: RESUME_FAILED }));
  };

  const onCallState = (busy: boolean) => {
    const wasActive = callActive;
    callActive = busy;
    if (!sawFirstState) {
      sawFirstState = true;
      return;
    }
    const { phase, pausedBy } = store.getState();
    if (busy && !wasActive && phase === 'recording') {
      session
        .pause()
        .then((pausedByUs) => {
          if (!pausedByUs) return;
          store.setState({ pausedBy: 'call' });
          // A short call can end while the pause was still flushing to disk.
          if (!callActive) resumeAfterCall();
        })
        .catch(() => undefined);
    } else if (!busy && phase === 'paused' && pausedBy === 'call') {
      resumeAfterCall();
    }
  };

  const sync = (phase: RecordingState['phase']) => {
    if (active(phase) && !stopWatching) {
      callActive = false;
      sawFirstState = false;
      stopWatching = watch(onCallState);
    } else if (!active(phase) && stopWatching) {
      stopWatching();
      stopWatching = null;
    }
  };

  const unsubscribe = store.subscribe((state, prev) => {
    // Leaving `paused` by any route (resume, end) clears the reason.
    if (prev.phase === 'paused' && state.phase !== 'paused' && state.pausedBy) store.setState({ pausedBy: null });
    if (state.phase !== prev.phase) sync(state.phase);
  });
  sync(store.getState().phase);

  return () => {
    unsubscribe();
    stopWatching?.();
    stopWatching = null;
  };
}
