import TestRenderer, { act } from 'react-test-renderer';
import { AppState, type AppStateStatus } from 'react-native';

/** The layout-level hook that tells the sync worker who is signed in and nudges it on foreground. */
let mockUser: { id: string } | undefined = { id: 'u1' };
jest.mock('./use-me-query', () => ({ useMeQuery: () => ({ data: mockUser ? { user: mockUser } : undefined }) }));
const mockWorker = { setOwner: jest.fn(), kick: jest.fn() };
jest.mock('../recording/recording-runtime', () => ({ getRecordingRuntime: async () => ({ worker: mockWorker }) }));

import { useRecordingSync } from './use-recording-sync';

function Probe() {
  useRecordingSync();
  return null;
}
const flush = () => act(async () => new Promise((r) => setTimeout(r, 0)));

describe('useRecordingSync', () => {
  let listener: ((s: AppStateStatus) => void) | null = null;
  beforeEach(() => {
    jest.clearAllMocks();
    mockUser = { id: 'u1' };
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, handler) => {
      listener = handler as (s: AppStateStatus) => void;
      return { remove: () => (listener = null) } as ReturnType<typeof AppState.addEventListener>;
    });
  });

  it('syncs only the signed-in user’s meetings, and stops when they sign out', async () => {
    let r!: TestRenderer.ReactTestRenderer;
    act(() => {
      r = TestRenderer.create(<Probe />);
    });
    await flush();
    expect(mockWorker.setOwner).toHaveBeenLastCalledWith('u1');

    mockUser = undefined;
    act(() => r.update(<Probe />));
    await flush();
    expect(mockWorker.setOwner).toHaveBeenLastCalledWith(null);
    act(() => r.unmount());
  });

  it('nudges the worker when the app comes back to the foreground', async () => {
    let r!: TestRenderer.ReactTestRenderer;
    act(() => {
      r = TestRenderer.create(<Probe />);
    });
    listener!('background');
    await flush();
    expect(mockWorker.kick).not.toHaveBeenCalled();
    listener!('active');
    await flush();
    expect(mockWorker.kick).toHaveBeenCalledTimes(1);
    act(() => r.unmount());
    expect(listener).toBeNull();
  });
});
