const mockNative = {
  isModelDownloaded: jest.fn(),
  downloadModel: jest.fn(),
  deleteModel: jest.fn(),
  translate: jest.fn(),
};
let mockModule: typeof mockNative | null = mockNative;
jest.mock('expo-modules-core', () => ({
  ...jest.requireActual('expo-modules-core'),
  requireOptionalNativeModule: () => mockModule,
}));

import * as mlkit from './mlkit-translate';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('mlkit-translate wrapper', () => {
  it('maps BCP-47 tags to ML Kit codes for every call', async () => {
    mockNative.isModelDownloaded.mockResolvedValue(true);
    mockNative.translate.mockResolvedValue('hello');
    await expect(mlkit.isModelDownloaded('vi-VN')).resolves.toBe(true);
    expect(mockNative.isModelDownloaded).toHaveBeenCalledWith('vi');
    await expect(mlkit.translate('xin chào', 'vi-VN', 'en-US')).resolves.toBe('hello');
    expect(mockNative.translate).toHaveBeenCalledWith('xin chào', 'vi', 'en');
  });

  it('downloads over any network unless wifiOnly is asked for', async () => {
    mockNative.downloadModel.mockResolvedValue(undefined);
    await mlkit.downloadModel('en-US');
    expect(mockNative.downloadModel).toHaveBeenLastCalledWith('en', { wifiOnly: false });
    await mlkit.downloadModel('en-US', { wifiOnly: true });
    expect(mockNative.downloadModel).toHaveBeenLastCalledWith('en', { wifiOnly: true });
  });

  it('deletes a pack by language', async () => {
    mockNative.deleteModel.mockResolvedValue(undefined);
    await mlkit.deleteModel('vi-VN');
    expect(mockNative.deleteModel).toHaveBeenCalledWith('vi');
  });

  it('returns the text untouched (no native call) when source and target are the same language', async () => {
    await expect(mlkit.translate('same', 'en-US', 'en-US')).resolves.toBe('same');
    expect(mockNative.translate).not.toHaveBeenCalled();
  });

  it('rejects an unsupported language instead of sending a bogus code to ML Kit', async () => {
    await expect(mlkit.translate('x', 'fr-FR' as never, 'en-US')).rejects.toThrow('Unsupported translation language');
    expect(mockNative.translate).not.toHaveBeenCalled();
  });

  it('rejects a non-string native result (never trust the bridge)', async () => {
    mockNative.translate.mockResolvedValue(42);
    await expect(mlkit.translate('x', 'vi-VN', 'en-US')).rejects.toThrow('Unexpected translation result');
  });

  it('passes native failures through to the caller', async () => {
    const failure = new Error('Model not downloaded');
    mockNative.translate.mockRejectedValue(failure);
    await expect(mlkit.translate('x', 'vi-VN', 'en-US')).rejects.toBe(failure);
  });
});

describe('without the native module', () => {
  it('reports unavailability and rejects with TranslationUnavailableError', async () => {
    mockModule = null;
    try {
      let unavailable!: typeof mlkit;
      jest.isolateModules(() => {
        unavailable = require('./mlkit-translate') as typeof mlkit; // eslint-disable-line @typescript-eslint/no-require-imports
      });
      expect(unavailable.isTranslationAvailable()).toBe(false);
      await expect(unavailable.isModelDownloaded('vi-VN')).rejects.toBeInstanceOf(unavailable.TranslationUnavailableError);
      await expect(unavailable.translate('x', 'vi-VN', 'en-US')).rejects.toBeInstanceOf(unavailable.TranslationUnavailableError);
    } finally {
      mockModule = mockNative;
    }
  });
});
