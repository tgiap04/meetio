import TestRenderer, { act } from 'react-test-renderer';
import { Alert, Text } from 'react-native';

/** `app/(app)/recording-live.tsx` (screen 06) against the real recording store and a fake session. */
const mockReplace = jest.fn();
const mockBack = jest.fn();
const mockRedirect = jest.fn((_props: { href: string }) => null);
jest.mock('expo-router', () => ({
  router: { replace: (...a: unknown[]) => mockReplace(...a), back: (...a: unknown[]) => mockBack(...a), canGoBack: () => true },
  Redirect: (props: { href: string }) => mockRedirect(props),
}));

const mockSession = { pause: jest.fn(async () => undefined), resume: jest.fn(async () => undefined), end: jest.fn(async () => undefined) };
jest.mock('../../recording/recording-runtime', () => ({
  getRecordingRuntime: async () => ({ session: mockSession, worker: { kick: jest.fn() } }),
}));

import RecordingLiveScreen from '../../../app/(app)/recording-live';
import { resetRecordingStore, useRecordingStore } from '../../recording/recording.store';
import { RECORDING_DONE_ROUTE } from '../../navigation/app-routes';
import { APP_HOME_ROUTE } from '../../navigation/route-guards';
import { Waveform } from './waveform';

// Every screen subscribes to the shared store — unmount after each test so an old one cannot react.
const mounted: TestRenderer.ReactTestRenderer[] = [];
afterEach(() => act(() => mounted.splice(0).forEach((r) => r.unmount())));

function render() {
  let r!: TestRenderer.ReactTestRenderer;
  act(() => {
    r = TestRenderer.create(<RecordingLiveScreen />);
  });
  mounted.push(r);
  return r;
}
const texts = (r: TestRenderer.ReactTestRenderer) => r.root.findAllByType(Text).map((t) => [t.props.children].flat().join(''));
const flush = () => act(async () => undefined);

describe('(app)/recording-live screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetRecordingStore();
    useRecordingStore.setState({ phase: 'recording', meetingId: 'm-1', startedAt: Date.now() - 65_000, quality: 'high', volume: 5 });
  });

  it('with no recording going on, sends the user Home instead of showing a fake recorder', () => {
    resetRecordingStore();
    render();
    expect(mockRedirect).toHaveBeenCalledWith(expect.objectContaining({ href: APP_HOME_ROUTE }));
  });

  it('shows the truth: recording indicator, real clock, lines, partial and sync state', () => {
    useRecordingStore.setState({
      lines: [{ seq: 1, text: 'xin chào', startedAtMs: 1_000, endedAtMs: 2_000, gapBeforeMs: 12_000 }],
      partial: 'đang nói',
      sync: { pending: 3, online: true },
    });
    const r = render();
    const all = texts(r);
    expect(all).toContain('Đang ghi âm');
    expect(all).toContain('00:01:05');
    expect(all).toContain('xin chào');
    expect(all).toContain('— Gián đoạn 12 giây —');
    expect(all).toContain('đang nói');
    expect(all).toContain('Đang chờ đồng bộ 3 đoạn');
    expect(r.root.findByType(Waveform).props.level).toBe(5);
  });

  it('paused: grey indicator, frozen waveform, the button resumes', async () => {
    useRecordingStore.setState({ phase: 'paused', pausedAt: Date.now() });
    const r = render();
    expect(texts(r)).toContain('Đã tạm dừng');
    expect(r.root.findByType(Waveform).props.level).toBeNull();
    await act(async () => r.root.findByProps({ testID: 'recording-pause-button' }).props.onPress());
    expect(mockSession.resume).toHaveBeenCalled();
    expect(mockSession.pause).not.toHaveBeenCalled();
  });

  it('battery-saving quality draws no waveform level', () => {
    useRecordingStore.setState({ quality: 'standard' });
    expect(render().root.findByType(Waveform).props.level).toBeNull();
  });

  it('pause button pauses', async () => {
    const r = render();
    await act(async () => r.root.findByProps({ testID: 'recording-pause-button' }).props.onPress());
    expect(mockSession.pause).toHaveBeenCalled();
  });

  it('"Kết thúc" asks first, and ends only on confirmation', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const r = render();
    act(() => r.root.findByProps({ testID: 'recording-end-button' }).props.onPress());
    expect(mockSession.end).not.toHaveBeenCalled();
    const buttons = alert.mock.calls[0][2]!;
    await act(async () => buttons.find((b) => b.text === 'Kết thúc')!.onPress!());
    expect(mockSession.end).toHaveBeenCalled();
  });

  it('while ending, shows sync progress; offline, lets the user leave with the transcript kept on the phone', () => {
    useRecordingStore.setState({ phase: 'ending', sync: { pending: 7, online: false } });
    const r = render();
    expect(r.root.findAllByProps({ testID: 'recording-end-button' })).toHaveLength(0);
    expect(texts(r)).toContain('7 đoạn được giữ an toàn trên máy và sẽ tự gửi khi có mạng.');
    act(() => r.root.findByProps({ label: 'Về trang chủ' }).props.onPress());
    expect(mockBack).toHaveBeenCalled();
  });

  it('moves on to screen 07 once the server accepted `end`', async () => {
    render();
    act(() => useRecordingStore.setState({ phase: 'idle', meetingId: null, endedMeetingId: 'm-1' }));
    await flush();
    expect(mockReplace).toHaveBeenCalledWith({ pathname: RECORDING_DONE_ROUTE, params: { id: 'm-1' } });
    expect(useRecordingStore.getState().endedMeetingId).toBeNull();
    expect(mockRedirect).not.toHaveBeenCalled(); // not also bounced Home by the now-idle store
  });

  it('X minimises — recording carries on', () => {
    const r = render();
    act(() => r.root.findByProps({ testID: 'recording-close-button' }).props.onPress());
    expect(mockBack).toHaveBeenCalled();
    expect(mockSession.end).not.toHaveBeenCalled();
  });

  it('shows the problem the user has to act on', () => {
    useRecordingStore.setState({ problem: 'Máy chưa tải gói nhận diện offline cho ngôn ngữ này.' });
    expect(texts(render())).toContain('Máy chưa tải gói nhận diện offline cho ngôn ngữ này.');
  });
});
