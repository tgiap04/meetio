import { pickRecordingLanguages, pickServerRecordingLanguages, RECORDING_LANGUAGES, resolveRecognitionMode } from './stt-engine';

describe('pickRecordingLanguages', () => {
  it('filters to only installed locales', () => {
    const result = pickRecordingLanguages(['vi-VN']);
    expect(result).toHaveLength(1);
    expect(result[0].tag).toBe('vi-VN');
  });

  it('returns empty array when no locales are installed', () => {
    const result = pickRecordingLanguages(['ja-JP', 'ko-KR']);
    expect(result).toHaveLength(0);
  });

  it('places device language first when installed', () => {
    const result = pickRecordingLanguages(['vi-VN', 'en-US'], 'en');
    expect(result[0].tag).toBe('en-US');
    expect(result[1].tag).toBe('vi-VN');
  });

  it('matches device language case-insensitively', () => {
    const result = pickRecordingLanguages(['vi-VN', 'en-US'], 'VI');
    expect(result[0].tag).toBe('vi-VN');
  });

  it('normalizes device language by comparing first component before dash', () => {
    // Device language 'en_US' split by '-' gives ['en_US'], so doesn't match 'en'
    // Only 'en' or 'en-...' would match
    const result = pickRecordingLanguages(['vi-VN', 'en-US'], 'en_US');
    // 'en_US' doesn't match 'en', so vi-VN stays first
    expect(result[0].tag).toBe('vi-VN');
  });

  it('matches installed locale case-insensitively', () => {
    const result = pickRecordingLanguages(['VI-VN'], 'vi');
    expect(result).toHaveLength(1);
    expect(result[0].tag).toBe('vi-VN');
  });

  it('matches installed locale underscore with tag dash', () => {
    const result = pickRecordingLanguages(['vi_VN'], 'vi');
    expect(result).toHaveLength(1);
    expect(result[0].tag).toBe('vi-VN');
  });

  it('does not move device language to front if not installed', () => {
    const result = pickRecordingLanguages(['vi-VN'], 'fr');
    expect(result[0].tag).toBe('vi-VN');
  });

  it('matches language code without region', () => {
    const result = pickRecordingLanguages(['en-US'], 'en');
    expect(result[0].tag).toBe('en-US');
  });

  it('returns all installed languages in order when device language not specified', () => {
    const result = pickRecordingLanguages(['vi-VN', 'en-US']);
    expect(result).toHaveLength(2);
    expect(result.map((l) => l.tag)).toEqual(['vi-VN', 'en-US']);
  });

  it('preserves relative order of remaining languages after moving device language', () => {
    // If both were installed and en was device language, vi should stay second
    const result = pickRecordingLanguages(['vi-VN', 'en-US'], 'en');
    expect(result[0].tag).toBe('en-US');
    expect(result[1].tag).toBe('vi-VN');
  });

  it('includes the full RecordingLanguage object with label', () => {
    const result = pickRecordingLanguages(['vi-VN']);
    expect(result[0]).toHaveProperty('label');
    expect(result[0].label).toBe('Tiếng Việt');
  });

  it('handles undefined device language gracefully', () => {
    const result = pickRecordingLanguages(['vi-VN', 'en-US'], undefined);
    expect(result).toHaveLength(2);
    expect(result[0].tag).toBe('vi-VN');
  });

  it('only returns languages in RECORDING_LANGUAGES', () => {
    const result = pickRecordingLanguages(['vi-VN', 'en-US', 'ja-JP']);
    expect(result.every((l) => RECORDING_LANGUAGES.includes(l))).toBe(true);
  });
});

describe('resolveRecognitionMode', () => {
  it('uses the device when it can recognise at least one offered language offline', () => {
    expect(resolveRecognitionMode(['en-US'])).toBe('on_device');
    expect(resolveRecognitionMode(['vi_VN', 'ja-JP'])).toBe('on_device');
  });

  it('falls back to the server when no offered language is installed on-device', () => {
    expect(resolveRecognitionMode([])).toBe('server');
    expect(resolveRecognitionMode(['ja-JP', 'ko-KR'])).toBe('server');
  });
});

describe('pickServerRecordingLanguages', () => {
  it('offers every language, device language first', () => {
    expect(pickServerRecordingLanguages('en-GB').map((l) => l.tag)).toEqual(['en-US', 'vi-VN']);
    expect(pickServerRecordingLanguages('vi').map((l) => l.tag)).toEqual(['vi-VN', 'en-US']);
  });

  it('keeps the default order for an unrelated or unknown device language', () => {
    expect(pickServerRecordingLanguages('ja-JP').map((l) => l.tag)).toEqual(['vi-VN', 'en-US']);
    expect(pickServerRecordingLanguages().map((l) => l.tag)).toEqual(['vi-VN', 'en-US']);
  });
});
