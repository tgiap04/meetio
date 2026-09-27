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
    fakeSpeech.reset();
    resetRecordingStore();
    await writeRecordingPreferences({ audioSource: 'device_mic', quality: 'high', language: null });
  });

  it('lists only the languages this phone can recognise offline, recommended quality selected', async () => {
    fakeSpeech.installedLocales = ['en-US'];
    const r = await render();
    expect(radio(r, 'Tiếng Anh').props.selected).toBe(true);
    expect(radio(r, 'Tiếng Việt')).toBeUndefined();
    expect(radio(r, 'Chất lượng cao (khuyến nghị)').props.selected).toBe(true);
  });

  it('with no offline language, explains how to get one and keeps Start disabled (US-12, NFR-02)', async () => {
    fakeSpeech.installedLocales = [];
    const r = await render();
    expect(r.root.findAllByProps({ testID: 'no-language-card' }).length).toBeGreaterThan(0);
    expect(r.root.findByProps({ label: 'Bắt đầu' }).props.disabled).toBe(true);
  });

  it('remembers source and quality for next time (US-42, US-43) and explains Bluetooth', async () => {
    const r = await render();
    await act(async () => radio(r, 'Tiếng Việt').props.onPress());
    await act(async () => radio(r, 'Thiết bị ngoài (Bluetooth)').props.onPress());
    await act(async () => radio(r, 'Tiết kiệm pin').props.onPress());
    expect(texts(r).some((t) => t.startsWith('Kết nối thiết bị Bluetooth'))).toBe(true);
    expect(await readRecordingPreferences()).toEqual({ audioSource: 'external_bluetooth', quality: 'standard', language: 'vi-VN' });
  });

  it('Start asks for permission, starts the session with the chosen settings, then opens screen 06', async () => {
    const r = await render();
    await act(async () => radio(r, 'Tiếng Anh').props.onPress());
    await press(r, 'Bắt đầu');
    expect(mockStart).toHaveBeenCalledWith({ ownerId: 'u1', language: 'en-US', audioSource: 'device_mic', quality: 'high' });
    expect(mockReplace).toHaveBeenCalledWith(RECORDING_LIVE_ROUTE);
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
