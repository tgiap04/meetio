import { Platform } from 'react-native';
import { buildRecognitionOptions, getOnDeviceLocales, OnDeviceCheckError } from './expo-stt-engine';
import { fakeSpeech } from './test-support/fake-speech-module';
import type { SttStartOptions } from './stt-engine';

describe('buildRecognitionOptions', () => {
  it('always sets requiresOnDeviceRecognition to true (NFR-02 privacy guarantee)', () => {
    const options: SttStartOptions = {
      lang: 'vi-VN',
      interim: false,
      bluetooth: false,
      volume: false,
    };
    const result = buildRecognitionOptions(options);
    expect(result.requiresOnDeviceRecognition).toBe(true);
  });

  it('requires on-device recognition even when volume is enabled', () => {
    const options: SttStartOptions = {
      lang: 'vi-VN',
      interim: true,
      bluetooth: false,
      volume: true,
    };
    const result = buildRecognitionOptions(options);
    expect(result.requiresOnDeviceRecognition).toBe(true);
  });

  it('requires on-device recognition even with bluetooth enabled', () => {
    const options: SttStartOptions = {
      lang: 'vi-VN',
      interim: false,
      bluetooth: true,
      volume: false,
    };
    const result = buildRecognitionOptions(options);
    expect(result.requiresOnDeviceRecognition).toBe(true);
  });

  it('requires on-device recognition with all options enabled', () => {
    const options: SttStartOptions = {
      lang: 'en-US',
      interim: true,
      bluetooth: true,
      volume: true,
    };
    const result = buildRecognitionOptions(options);
    expect(result.requiresOnDeviceRecognition).toBe(true);
  });

  it('maps interim to interimResults', () => {
    const withInterim = buildRecognitionOptions({
      lang: 'vi-VN',
      interim: true,
      bluetooth: false,
      volume: false,
    });
    expect(withInterim.interimResults).toBe(true);

    const withoutInterim = buildRecognitionOptions({
      lang: 'vi-VN',
      interim: false,
      bluetooth: false,
      volume: false,
    });
    expect(withoutInterim.interimResults).toBe(false);
  });

  it('includes volume options when volume is true', () => {
    const options: SttStartOptions = {
      lang: 'vi-VN',
      interim: false,
      bluetooth: false,
      volume: true,
    };
    const result = buildRecognitionOptions(options);
    expect(result.volumeChangeEventOptions).toEqual({
      enabled: true,
      intervalMillis: 150,
    });
  });

  it('excludes volume options when volume is false', () => {
    const options: SttStartOptions = {
      lang: 'vi-VN',
      interim: false,
      bluetooth: false,
      volume: false,
    };
    const result = buildRecognitionOptions(options);
    expect(result.volumeChangeEventOptions).toBeUndefined();
  });

  it('maps bluetooth to iosCategory with playAndRecord', () => {
    const options: SttStartOptions = {
      lang: 'vi-VN',
      interim: false,
      bluetooth: true,
      volume: false,
    };
    const result = buildRecognitionOptions(options);
    expect(result.iosCategory).toEqual({
      category: 'playAndRecord',
      categoryOptions: ['allowBluetooth', 'defaultToSpeaker'],
      mode: 'measurement',
    });
  });

  it('excludes iosCategory when bluetooth is false', () => {
    const options: SttStartOptions = {
      lang: 'vi-VN',
      interim: false,
      bluetooth: false,
      volume: false,
    };
    const result = buildRecognitionOptions(options);
    expect(result.iosCategory).toBeUndefined();
  });

  it('preserves language tag exactly', () => {
    const options: SttStartOptions = {
      lang: 'en-US',
      interim: false,
      bluetooth: false,
      volume: false,
    };
    const result = buildRecognitionOptions(options);
    expect(result.lang).toBe('en-US');
  });

  it('always sets continuous to true', () => {
    const options: SttStartOptions = {
      lang: 'vi-VN',
      interim: false,
      bluetooth: false,
      volume: false,
    };
    const result = buildRecognitionOptions(options);
    expect(result.continuous).toBe(true);
  });

  it('always sets addsPunctuation to false', () => {
    const options: SttStartOptions = {
      lang: 'vi-VN',
      interim: false,
      bluetooth: false,
      volume: false,
    };
    const result = buildRecognitionOptions(options);
    expect(result.addsPunctuation).toBe(false);
  });

  it('always sets maxAlternatives to 1', () => {
    const options: SttStartOptions = {
      lang: 'vi-VN',
      interim: false,
      bluetooth: false,
      volume: false,
    };
    const result = buildRecognitionOptions(options);
    expect(result.maxAlternatives).toBe(1);
  });

  it('sets iosTaskHint to dictation', () => {
    const options: SttStartOptions = {
      lang: 'vi-VN',
      interim: false,
      bluetooth: false,
      volume: false,
    };
    const result = buildRecognitionOptions(options);
    expect(result.iosTaskHint).toBe('dictation');
  });

  it('combines volume and bluetooth options correctly', () => {
    const options: SttStartOptions = {
      lang: 'vi-VN',
      interim: true,
      bluetooth: true,
      volume: true,
    };
    const result = buildRecognitionOptions(options);
    expect(result.volumeChangeEventOptions).toBeDefined();
    expect(result.iosCategory).toBeDefined();
    expect(result.interimResults).toBe(true);
    expect(result.requiresOnDeviceRecognition).toBe(true);
  });
});

describe('getOnDeviceLocales', () => {
  beforeEach(() => fakeSpeech.reset());
  afterEach(() => jest.restoreAllMocks());

  it('lists what the native module reports as installed', async () => {
    fakeSpeech.installedLocales = ['vi-VN'];
    await expect(getOnDeviceLocales()).resolves.toEqual(['vi-VN']);
  });

  it('a successful empty answer is empty — the phone really cannot recognise offline', async () => {
    fakeSpeech.installedLocales = [];
    await expect(getOnDeviceLocales()).resolves.toEqual([]);
  });

  it('a native failure is NOT an empty list: it rejects so the audio is never silently sent to the server (NFR-02)', async () => {
    fakeSpeech.localesError = new Error('service crashed');
    await expect(getOnDeviceLocales()).rejects.toBeInstanceOf(OnDeviceCheckError);
  });

  it('Android below 13 has no reliable on-device recognition: empty without asking the module', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    jest.spyOn(Platform, 'Version', 'get').mockReturnValue(31);
    fakeSpeech.localesError = new Error('must not be asked');
    await expect(getOnDeviceLocales()).resolves.toEqual([]);
  });
});
