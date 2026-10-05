import type { RecordingPhase, RecordingState } from './recording.store';

/** Emitted by the patched react-native-background-actions when a notification button is tapped. */
export const NOTIFICATION_ACTION_EVENT = 'RNBackgroundActionsNotificationAction';

export type NotificationActionId = 'pause' | 'resume' | 'end';

export interface RecordingNotificationContent {
  taskDesc: string;
  actions: { id: NotificationActionId; title: string }[];
}

/** What the foreground-service notification says, and which buttons it carries, in each phase. */
export function notificationForPhase(phase: RecordingPhase, pausedBy: RecordingState['pausedBy'] = null): RecordingNotificationContent {
  switch (phase) {
    case 'recording':
      return {
        taskDesc: 'Chạm để mở lại màn hình ghi',
        actions: [
          { id: 'pause', title: 'Tạm dừng' },
          { id: 'end', title: 'Kết thúc' },
        ],
      };
    case 'paused':
      return {
        taskDesc:
          pausedBy === 'call'
            ? 'Đã tạm dừng vì có cuộc gọi — tự ghi tiếp khi gọi xong'
            : 'Đã tạm dừng — chạm để mở lại màn hình ghi',
        actions: [
          { id: 'resume', title: 'Tiếp tục' },
          { id: 'end', title: 'Kết thúc' },
        ],
      };
    default:
      return { taskDesc: 'Đang lưu cuộc họp…', actions: [] };
  }
}

interface SessionControls {
  pause(): Promise<unknown>;
  resume(): Promise<void>;
  end(): Promise<void>;
}

interface StoreLike {
  getState(): Pick<RecordingState, 'phase' | 'pausedBy'>;
  setState(partial: Partial<RecordingState>): void;
  subscribe(listener: (state: RecordingState, prev: RecordingState) => void): () => void;
}

interface EmitterLike {
  addListener(event: string, listener: (id: string) => void): { remove(): void };
}

export interface RecordingNotificationDeps {
  session: SessionControls;
  store: StoreLike;
  emitter: EmitterLike;
  /** Redraws the running service's notification; must not throw when no service is running. */
  update: (content: RecordingNotificationContent) => Promise<void>;
}

/**
 * Connects notification buttons to the recording session — the same `pause` / `resume` / `end` the
 * screen calls, so offline queueing and every guard behave identically — and keeps the buttons in
 * step with the phase. The session runs transitions one at a time and re-checks the phase on its
 * turn, so a tap during a pause flush is queued (End after Pause still ends) and a duplicate tap is
 * a no-op there. Returns the unsubscribe.
 */
export function wireRecordingNotification(deps: RecordingNotificationDeps): () => void {
  const { session, store, emitter, update } = deps;

  const allowed = (id: string, phase: RecordingPhase): id is NotificationActionId =>
    (id === 'pause' && phase === 'recording') ||
    (id === 'resume' && phase === 'paused') ||
    (id === 'end' && (phase === 'recording' || phase === 'paused'));

  const sub = emitter.addListener(NOTIFICATION_ACTION_EVENT, (id) => {
    if (!allowed(id, store.getState().phase)) return;
    session[id]().catch(() => {
      store.setState({
        problem: 'Không thực hiện được thao tác từ thông báo. Mở Meetio để thử lại — transcript vẫn được giữ trên máy.',
      });
    });
  });

  const unsubscribe = store.subscribe((state, prev) => {
    if (state.phase === prev.phase && state.pausedBy === prev.pausedBy) return;
    void update(notificationForPhase(state.phase, state.pausedBy)).catch(() => undefined);
  });

  return () => {
    sub.remove();
    unsubscribe();
  };
}
