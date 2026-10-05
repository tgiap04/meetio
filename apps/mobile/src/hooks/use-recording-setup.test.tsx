import TestRenderer, { act } from 'react-test-renderer';
import { useRecordingSetup, type RecordingSetupState } from './use-recording-setup';
import { fakeSpeech } from '../recording/test-support/fake-speech-module';
import { readRecordingPreferences, writeRecordingPreferences } from '../recording/recording-preferences';

const mounted: TestRenderer.ReactTestRenderer[] = [];
afterEach(() => act(() => mounted.splice(0).forEach((r) => r.unmount())));

async function renderHook(): Promise<{ current: RecordingSetupState }> {
  const result = {} as { current: RecordingSetupState };
  function Probe() {
    result.current = useRecordingSetup();
    return null;
  }
  await act(async () => {
    mounted.push(TestRenderer.create(<Probe />));
  });
  return result;
}

describe('useRecordingSetup recognition mode (Phase 18)', () => {
  beforeEach(async () => {
    fakeSpeech.reset();
    await writeRecordingPreferences({ audioSource: 'device_mic', quality: 'high', language: null, translateTo: null });
  });

  it('is on_device with only the installed languages when the phone can recognise offline', async () => {
    fakeSpeech.installedLocales = ['en-US'];
    const hook = await renderHook();
    expect(hook.current.loading).toBe(false);
    expect(hook.current.mode).toBe('on_device');
    expect(hook.current.languages.map((l) => l.tag)).toEqual(['en-US']);
    expect(hook.current.preferences.language).toBe('en-US');
  });

  it('is server with every language when nothing can be recognised on-device', async () => {
    fakeSpeech.installedLocales = [];
    const hook = await renderHook();
    expect(hook.current.mode).toBe('server');
    expect(hook.current.languages.map((l) => l.tag).sort()).toEqual(['en-US', 'vi-VN']);
    expect(hook.current.preferences.language).toBe(hook.current.languages[0].tag);
  });

  it('keeps a remembered language that the server offers even though it is not installed on-device', async () => {
    fakeSpeech.installedLocales = [];
    await writeRecordingPreferences({ audioSource: 'device_mic', quality: 'high', language: 'en-US', translateTo: null });
    const hook = await renderHook();
    expect(hook.current.preferences.language).toBe('en-US');
  });

  it('has no mode while still loading', async () => {
    const result = {} as { current: RecordingSetupState };
    function Probe() {
      result.current = useRecordingSetup();
      return null;
    }
    act(() => {
      mounted.push(TestRenderer.create(<Probe />));
    });
    expect(result.current.loading).toBe(true);
    expect(result.current.mode).toBeNull();
    await act(async () => {}); // let the pending check finish inside act
  });

  it('a native failure while checking is NOT server mode: no mode, no languages, a flag to show retry', async () => {
    fakeSpeech.localesError = new Error('speech service crashed');
    const hook = await renderHook();
    expect(hook.current.loading).toBe(false);
    expect(hook.current.checkFailed).toBe(true);
    expect(hook.current.mode).toBeNull();
    expect(hook.current.languages).toEqual([]);
  });

  it('retryCheck re-runs the check and recovers', async () => {
    fakeSpeech.localesError = new Error('speech service crashed');
    const hook = await renderHook();
    fakeSpeech.localesError = null;
    fakeSpeech.installedLocales = ['vi-VN'];
    await act(async () => hook.current.retryCheck());
    expect(hook.current.checkFailed).toBe(false);
    expect(hook.current.mode).toBe('on_device');
  });
});

describe('useRecordingSetup translation (Phase 09)', () => {
  beforeEach(async () => {
    fakeSpeech.reset();
    fakeSpeech.installedLocales = ['vi-VN', 'en-US'];
    await writeRecordingPreferences({ audioSource: 'device_mic', quality: 'high', language: 'vi-VN', translateTo: null });
  });

  it('is off by default', async () => {
    const hook = await renderHook();
    expect(hook.current.preferences.translateTo).toBeNull();
  });

  it('remembers the chosen translation language across sessions', async () => {
    const hook = await renderHook();
    await act(async () => hook.current.update({ translateTo: 'en-US' }));
    expect(hook.current.preferences.translateTo).toBe('en-US');
    expect((await readRecordingPreferences()).translateTo).toBe('en-US');
    const next = await renderHook();
    expect(next.current.preferences.translateTo).toBe('en-US');
  });

  it('switching the spoken language to the one being translated into turns translation off (it would translate into itself)', async () => {
    await writeRecordingPreferences({ audioSource: 'device_mic', quality: 'high', language: 'vi-VN', translateTo: 'en-US' });
    const hook = await renderHook();
    expect(hook.current.preferences.translateTo).toBe('en-US');
    await act(async () => hook.current.update({ language: 'en-US' }));
    expect(hook.current.preferences).toMatchObject({ language: 'en-US', translateTo: null });
    expect((await readRecordingPreferences()).translateTo).toBeNull();
  });

  it('a remembered target equal to the language that loads is dropped', async () => {
    await writeRecordingPreferences({ audioSource: 'device_mic', quality: 'high', language: 'en-US', translateTo: 'en-US' });
    const hook = await renderHook();
    expect(hook.current.preferences.translateTo).toBeNull();
  });
});
