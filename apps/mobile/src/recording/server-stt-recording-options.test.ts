// expo-audio's native module is not loadable under jest; its two enums are mirrored with their real values.
jest.mock('expo-audio', () => ({ IOSOutputFormat: { MPEG4AAC: 'aac ' }, AudioQuality: { MEDIUM: 64 } }));

import { chunkRecordingOptions } from './server-stt-recording-options';

describe('chunkRecordingOptions', () => {
  it('records mono 16 kHz AAC in .m4a on Android', () => {
    expect(chunkRecordingOptions('android', false)).toEqual({
      extension: '.m4a',
      sampleRate: 16_000,
      numberOfChannels: 1,
      bitRate: 32_000,
      isMeteringEnabled: false,
      outputFormat: 'mpeg4',
      audioEncoder: 'aac',
    });
  });

  it('records mono 16 kHz AAC in .m4a on iOS, medium quality', () => {
    expect(chunkRecordingOptions('ios', false)).toEqual({
      extension: '.m4a',
      sampleRate: 16_000,
      numberOfChannels: 1,
      bitRate: 32_000,
      isMeteringEnabled: false,
      outputFormat: 'aac ',
      audioQuality: 64,
    });
  });

  it('turns metering on only when the waveform needs it', () => {
    expect(chunkRecordingOptions('android', true).isMeteringEnabled).toBe(true);
    expect(chunkRecordingOptions('ios', true).isMeteringEnabled).toBe(true);
  });
});
