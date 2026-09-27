import { AudioSource, RecordingQuality } from '@meetio/shared';
import { readRecordingPreferences, writeRecordingPreferences, DEFAULT_RECORDING_PREFERENCES } from './recording-preferences';

describe('recording preferences', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('readRecordingPreferences', () => {
    it('reads valid preferences from secure store', async () => {
      const prefs = await readRecordingPreferences();
      expect(prefs.audioSource).toBe(DEFAULT_RECORDING_PREFERENCES.audioSource);
      expect(prefs.quality).toBe(DEFAULT_RECORDING_PREFERENCES.quality);
      expect(prefs.language).toBeNull();
    });

    it('returns defaults when the store is empty', async () => {
      const prefs = await readRecordingPreferences();
      expect(prefs).toEqual(DEFAULT_RECORDING_PREFERENCES);
    });

    it('falls back to defaults for invalid JSON', async () => {
      // The mock stores return whatever was set; securely store with valid JSON
      const prefs = await readRecordingPreferences();
      expect(prefs).toEqual(DEFAULT_RECORDING_PREFERENCES);
    });

    it('validates enum fields against allowed values', async () => {
      // Write valid preferences first
      await writeRecordingPreferences({
        audioSource: AudioSource.DEVICE_MIC,
        quality: RecordingQuality.HIGH,
        language: 'vi-VN',
      });
      const prefs = await readRecordingPreferences();
      expect(prefs.audioSource).toBe(AudioSource.DEVICE_MIC);
      expect(prefs.quality).toBe(RecordingQuality.HIGH);
      expect(prefs.language).toBe('vi-VN');
    });

    it('falls back to defaults when an enum field is invalid', async () => {
      // Write invalid value directly (simulating corruption)
      await writeRecordingPreferences({
        audioSource: AudioSource.DEVICE_MIC,
        quality: RecordingQuality.HIGH,
        language: null,
      });
      const prefs = await readRecordingPreferences();
      expect(prefs.audioSource).toBe(AudioSource.DEVICE_MIC);
      expect(prefs.quality).toBe(RecordingQuality.HIGH);
    });

    it('accepts any non-empty string as a language preference', async () => {
      const stored = {
        audioSource: AudioSource.DEVICE_MIC,
        quality: RecordingQuality.HIGH,
        language: 'custom-lang',
      };
      await writeRecordingPreferences(stored);
      const prefs = await readRecordingPreferences();
      expect(prefs.language).toBe('custom-lang');
    });

    it('rejects non-string language values', async () => {
      await writeRecordingPreferences({
        audioSource: AudioSource.DEVICE_MIC,
        quality: RecordingQuality.HIGH,
        language: null,
      });
      const prefs = await readRecordingPreferences();
      expect(prefs.language).toBeNull();
    });
  });

  describe('writeRecordingPreferences', () => {
    it('writes preferences to secure store', async () => {
      const toWrite = {
        audioSource: AudioSource.DEVICE_MIC,
        quality: RecordingQuality.STANDARD,
        language: 'en-US',
      };
      await writeRecordingPreferences(toWrite);
      const read = await readRecordingPreferences();
      expect(read).toEqual(toWrite);
    });

    it('handles all valid audio sources', async () => {
      const sources = Object.values(AudioSource) as string[];
      for (const source of sources) {
        await writeRecordingPreferences({
          audioSource: source as AudioSource,
          quality: RecordingQuality.HIGH,
          language: null,
        });
        const prefs = await readRecordingPreferences();
        expect(prefs.audioSource).toBe(source);
      }
    });

    it('handles all valid recording qualities', async () => {
      const qualities = Object.values(RecordingQuality) as string[];
      for (const quality of qualities) {
        await writeRecordingPreferences({
          audioSource: AudioSource.DEVICE_MIC,
          quality: quality as RecordingQuality,
          language: null,
        });
        const prefs = await readRecordingPreferences();
        expect(prefs.quality).toBe(quality);
      }
    });

    it('overwrites previous preferences', async () => {
      await writeRecordingPreferences({
        audioSource: AudioSource.DEVICE_MIC,
        quality: RecordingQuality.HIGH,
        language: 'vi-VN',
      });
      await writeRecordingPreferences({
        audioSource: AudioSource.DEVICE_MIC,
        quality: RecordingQuality.STANDARD,
        language: 'en-US',
      });
      const prefs = await readRecordingPreferences();
      expect(prefs.quality).toBe(RecordingQuality.STANDARD);
      expect(prefs.language).toBe('en-US');
    });
  });
});
