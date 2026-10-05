import TestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';

/**
 * `app/(app)/recording-setup.tsx` (screen 05) with the real preferences store (in-memory
 * secure-store) and the scriptable speech-recognition fake from jest.setup.ts.
 */
const mockReplace = jest.fn();
const mockRedirect = jest.fn((_props: { href: string }) => null);
jest.mock('expo-router', () => ({
  router: { replace: (...a: unknown[]) => mockReplace(...a), back: jest.fn() },
  Redirect: (props: { href: string }) => mockRedirect(props),
}));
jest.mock('../../hooks/use-me-query', () => ({ useMeQuery: () => ({ data: { user: { id: 'u1' } } }) }));

const mockStart = jest.fn(async (_settings: unknown) => 'meeting-1');
jest.mock('../../recording/recording-runtime', () => ({
  getRecordingRuntime: async () => ({ session: { start: (s: unknown) => mockStart(s) } }),
}));

// expo-audio has no usable native module under jest; server mode's mic permission is scripted here.
const mockServerPermission = jest.fn(async () => ({ granted: true, canAskAgain: true }));
jest.mock('../../recording/server-stt-native', () => ({ requestServerRecordingPermissions: () => mockServerPermission() }));
const mockReachable = jest.fn(async () => true);
jest.mock('../../api/stt', () => ({ isServerReachable: () => mockReachable() }));

import RecordingSetupScreen from '../../../app/(app)/recording-setup';
import { fakeSpeech } from '../../recording/test-support/fake-speech-module';
import { readRecordingPreferences, writeRecordingPreferences } from '../../recording/recording-preferences';
import { resetRecordingStore, useRecordingStore } from '../../recording/recording.store';
import { RECORDING_LIVE_ROUTE } from '../../navigation/app-routes';
import { RadioRow } from './radio-row';

const mounted: TestRenderer.ReactTestRenderer[] = [];
afterEach(() => act(() => mounted.splice(0).forEach((r) => r.unmount())));

async function render() {
  let r!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    r = TestRenderer.create(<RecordingSetupScreen />);
  });
  mounted.push(r);
  return r;
}
const texts = (r: TestRenderer.ReactTestRenderer) => r.root.findAllByType(Text).map((t) => [t.props.children].flat().join(''));
const radio = (r: TestRenderer.ReactTestRenderer, label: string) => r.root.findAll((n) => n.type === RadioRow && n.props.label === label)[0];
const press = (r: TestRenderer.ReactTestRenderer, label: string) => act(async () => r.root.findByProps({ label }).props.onPress());

describe('(app)/recording-setup screen', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    mockReachable.mockResolvedValue(true);
    mockServerPermission.mockResolvedValue({ granted: true, canAskAgain: true });
    fakeSpeech.reset();
    resetRecordingStore();
    await writeRecordingPreferences({ audioSource: 'device_mic', quality: 'high', language: null, translateTo: null });
  });

  it('lists only the languages this phone can recognise offline, recommended quality selected', async () => {
    fakeSpeech.installedLocales = ['en-US'];
    const r = await render();
    expect(radio(r, 'Tiếng Anh').props.selected).toBe(true);
    // Tiếng Việt is not offered to SPEAK (one row only: the "Dịch sang" target, not selected).
    const viet = r.root.findAll((n) => n.type === RadioRow && n.props.label === 'Tiếng Việt');
    expect(viet.map((n) => n.props.selected)).toEqual([false]);
    expect(radio(r, 'Chất lượng cao (khuyến nghị)').props.selected).toBe(true);
  });

  it('on-device phones see no server notice', async () => {
    const r = await render();
    expect(r.root.findAllByProps({ testID: 'server-mode-notice' })).toHaveLength(0);
  });

  describe('when the phone cannot say what it can recognise', () => {
    beforeEach(() => {
      fakeSpeech.localesError = new Error('speech service crashed');
    });

    it('shows a retry state instead of silently choosing the server, and cannot start', async () => {
      const r = await render();
      expect(texts(r)).toContain('Không kiểm tra được khả năng nhận diện của máy — thử lại');
      expect(r.root.findAllByProps({ testID: 'server-mode-notice' })).toHaveLength(0);
      expect(r.root.findByProps({ label: 'Bắt đầu' }).props.disabled).toBe(true);
    });

    it('Thử lại checks again and lists the languages once it works', async () => {
      const r = await render();
      fakeSpeech.localesError = null;
      await press(r, 'Thử lại');
      expect(r.root.findAllByProps({ testID: 'recognition-check-failed' })).toHaveLength(0);
      expect(radio(r, 'Tiếng Việt')).toBeDefined();
    });
  });

  describe('a phone that cannot recognise speech offline (server mode, Phase 18)', () => {
    beforeEach(() => {
      fakeSpeech.installedLocales = [];
    });

    it('offers both languages and says audio goes to the Meetio server and is not kept', async () => {
      const r = await render();
      expect(radio(r, 'Tiếng Việt')).toBeDefined();
      expect(radio(r, 'Tiếng Anh')).toBeDefined();
      expect(r.root.findAllByProps({ testID: 'server-mode-notice' }).length).toBeGreaterThan(0);
      expect(texts(r).join(' ')).toContain(
        'Máy này không nhận diện giọng nói offline được — âm thanh sẽ được gửi liên tục lên máy chủ Meetio và Google Gemini để chuyển thành chữ; máy chủ Meetio không lưu lại âm thanh. Meetio đang dùng gói miễn phí của Gemini — Google có thể dùng nội dung này để cải thiện sản phẩm.',
      );
      expect(r.root.findAllByProps({ testID: 'no-language-card' })).toHaveLength(0);
      expect(r.root.findByProps({ label: 'Bắt đầu' }).props.disabled).toBe(false);
    });

    it('starts the session in server mode after a reachable server, asking only for the microphone', async () => {
      const r = await render();
      await act(async () => radio(r, 'Tiếng Anh').props.onPress());
      await press(r, 'Bắt đầu');
      expect(mockReachable).toHaveBeenCalled();
      expect(mockServerPermission).toHaveBeenCalled();
      expect(mockStart).toHaveBeenCalledWith({ ownerId: 'u1', language: 'en-US', audioSource: 'device_mic', quality: 'high', mode: 'server', translateTo: null });
      expect(mockReplace).toHaveBeenCalledWith(RECORDING_LIVE_ROUTE);
    });

    it('does not start without a network: shows the reason instead', async () => {
      mockReachable.mockResolvedValue(false);
      const r = await render();
      await act(async () => radio(r, 'Tiếng Việt').props.onPress());
      await press(r, 'Bắt đầu');
      expect(mockStart).not.toHaveBeenCalled();
      expect(mockServerPermission).not.toHaveBeenCalled();
      expect(texts(r)).toContain('Chế độ máy chủ cần kết nối mạng. Kiểm tra mạng rồi thử lại.');
    });

    it('clears the offline message on the next try once the network is back', async () => {
      mockReachable.mockResolvedValueOnce(false);
      const r = await render();
      await act(async () => radio(r, 'Tiếng Việt').props.onPress());
      await press(r, 'Bắt đầu');
      await press(r, 'Bắt đầu');
      expect(texts(r)).not.toContain('Chế độ máy chủ cần kết nối mạng. Kiểm tra mạng rồi thử lại.');
      expect(mockStart).toHaveBeenCalledTimes(1);
    });

    it('guides to Settings when the microphone is blocked for good', async () => {
      mockServerPermission.mockResolvedValue({ granted: false, canAskAgain: false });
      const r = await render();
      await act(async () => radio(r, 'Tiếng Việt').props.onPress());
      await press(r, 'Bắt đầu');
      expect(mockStart).not.toHaveBeenCalled();
      expect(texts(r).join(' ')).toContain('Quyền đã bị tắt');
    });
  });

  it('remembers source and quality for next time (US-42, US-43) and explains Bluetooth', async () => {
    const r = await render();
    await act(async () => radio(r, 'Tiếng Việt').props.onPress());
    await act(async () => radio(r, 'Thiết bị ngoài (Bluetooth)').props.onPress());
    await act(async () => radio(r, 'Tiết kiệm pin').props.onPress());
    expect(texts(r).some((t) => t.startsWith('Kết nối thiết bị Bluetooth'))).toBe(true);
    expect(await readRecordingPreferences()).toEqual({ audioSource: 'external_bluetooth', quality: 'standard', language: 'vi-VN', translateTo: null });
  });

  it('Start asks for permission, starts the session with the chosen settings, then opens screen 06', async () => {
    const r = await render();
    await act(async () => radio(r, 'Tiếng Anh').props.onPress());
    await press(r, 'Bắt đầu');
    expect(mockStart).toHaveBeenCalledWith({ ownerId: 'u1', language: 'en-US', audioSource: 'device_mic', quality: 'high', mode: 'on_device', translateTo: null });
    expect(mockReachable).not.toHaveBeenCalled(); // on-device recording needs no network
    expect(mockReplace).toHaveBeenCalledWith(RECORDING_LIVE_ROUTE);
  });

  describe('translation (Phase 09)', () => {
    it('is off by default: no cost note, and recording starts with no translate_to', async () => {
      const r = await render();
      expect(r.root.findAllByProps({ testID: 'translation-cost-note' })).toHaveLength(0);
      await press(r, 'Bắt đầu');
      expect(mockStart).toHaveBeenCalledWith(expect.objectContaining({ translateTo: null }));
    });

    it('choosing the other language shows the cost note, is remembered, and goes into the session start', async () => {
      const r = await render();
      await act(async () => radio(r, 'Tiếng Việt').props.onPress());
      // The translation card repeats the language names; the one for the OTHER language sits last.
      const target = r.root.findAll((n) => n.type === RadioRow && n.props.label === 'Tiếng Anh').at(-1)!;
      await act(async () => target.props.onPress());
      expect(texts(r)).toContain('Dịch dùng thêm AI cho mỗi câu — tốn chi phí hơn.');
      expect((await readRecordingPreferences()).translateTo).toBe('en-US');
      await press(r, 'Bắt đầu');
      expect(mockStart).toHaveBeenCalledWith(expect.objectContaining({ language: 'vi-VN', translateTo: 'en-US' }));
    });
  });

  it('permission refused for good: no recording, guidance to system Settings instead of a blank error (US-07)', async () => {
    fakeSpeech.permission = { granted: false, canAskAgain: false };
    const r = await render();
    await press(r, 'Bắt đầu');
    expect(mockStart).not.toHaveBeenCalled();
    expect(texts(r).join(' ')).toContain('Quyền đã bị tắt — bật lại trong Cài đặt của máy.');
    expect(r.root.findAllByProps({ label: 'Mở Cài đặt' }).length).toBeGreaterThan(0);
  });

  it('while a recording is live, goes straight back to it instead of starting another', async () => {
    useRecordingStore.setState({ phase: 'recording', meetingId: 'm-live' });
    await render();
    expect(mockRedirect).toHaveBeenCalledWith(expect.objectContaining({ href: RECORDING_LIVE_ROUTE }));
  });
});
