import TestRenderer, { act } from 'react-test-renderer';
import { useRecordingActions } from './use-recording-actions';

jest.mock('../recording/recording-runtime', () => ({ getRecordingRuntime: async () => ({ session: {} }) }));

const mounted: TestRenderer.ReactTestRenderer[] = [];
afterEach(() => act(() => mounted.splice(0).forEach((r) => r.unmount())));

async function renderHook() {
  const result = {} as { current: ReturnType<typeof useRecordingActions> };
  function Probe() {
    result.current = useRecordingActions();
    return null;
  }
  await act(async () => {
    mounted.push(TestRenderer.create(<Probe />));
  });
  return result;
}

describe('useRecordingActions', () => {
  it('runs one command at a time: a command fired while another is running is ignored', async () => {
    const hook = await renderHook();
    let release!: () => void;
    const slow = jest.fn(() => new Promise<string>((resolve) => (release = () => resolve('done'))));
    const second = jest.fn(async () => 'second');
    let first!: Promise<string | undefined>;
    let other!: Promise<string | undefined>;
    await act(async () => {
      first = hook.current.run(slow);
      other = hook.current.run(second); // same tick, before any re-render
    });
    expect(await other).toBeUndefined();
    expect(second).not.toHaveBeenCalled();
    expect(hook.current.busy).toBe(true);
    await act(async () => {
      release();
      await first;
    });
    expect(hook.current.busy).toBe(false);
    await act(async () => void (await hook.current.run(second)));
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('reports a failure and accepts the next command', async () => {
    const hook = await renderHook();
    await act(async () => void (await hook.current.run(async () => Promise.reject(new Error('x')))));
    expect(hook.current.error).toContain('Không thực hiện được thao tác');
    await act(async () => void (await hook.current.run(async () => 'ok')));
    expect(hook.current.error).toBeNull();
  });
});
