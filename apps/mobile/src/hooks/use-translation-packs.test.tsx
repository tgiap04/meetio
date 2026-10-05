import TestRenderer, { act } from 'react-test-renderer';
import { downloadModel, isModelDownloaded, isTranslationAvailable } from '../../modules/mlkit-translate';
import { DOWNLOAD_TIMEOUT_MS, PACK_CHECK_FAILED, PACK_DOWNLOAD_FAILED, useTranslationPacks, type TranslationPacks } from './use-translation-packs';

jest.mock('../../modules/mlkit-translate', () => ({
  isTranslationAvailable: jest.fn(),
  isModelDownloaded: jest.fn(),
  downloadModel: jest.fn(),
}));
const mockAvailable = isTranslationAvailable as jest.Mock;
const mockIsDownloaded = isModelDownloaded as jest.Mock;
const mockDownload = downloadModel as jest.Mock;

let packs: TranslationPacks;
const mounted: TestRenderer.ReactTestRenderer[] = [];
function Harness({ language, translateTo }: { language: string | null; translateTo: string | null }) {
  packs = useTranslationPacks(language, translateTo);
  return null;
}
const mount = async (language: string | null, translateTo: string | null) => {
  let r!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    r = TestRenderer.create(<Harness language={language} translateTo={translateTo} />);
  });
  mounted.push(r);
  return r;
};
afterEach(() => act(() => mounted.splice(0).forEach((r) => r.unmount())));
beforeEach(() => {
  jest.clearAllMocks();
  mockAvailable.mockReturnValue(true);
});

describe('useTranslationPacks', () => {
  it('is off, and checks nothing, while translation is not chosen', async () => {
    await mount('vi-VN', null);
    expect(packs.status).toBe('off');
    expect(mockIsDownloaded).not.toHaveBeenCalled();
  });

  it('is ready when BOTH the spoken and the target pack are on the phone', async () => {
    mockIsDownloaded.mockResolvedValue(true);
    await mount('vi-VN', 'en-US');
    expect(packs.status).toBe('ready');
    expect(mockIsDownloaded.mock.calls.map((c) => c[0])).toEqual(['vi-VN', 'en-US']);
  });

  it('is missing when only one of the two packs is there — Start must stay blocked', async () => {
    mockIsDownloaded.mockImplementation(async (l: string) => l === 'vi-VN');
    await mount('vi-VN', 'en-US');
    expect(packs.status).toBe('missing');
  });

  it('downloads only what is missing (cellular allowed), then verifies and becomes ready', async () => {
    let en = false;
    mockIsDownloaded.mockImplementation(async (l: string) => l === 'vi-VN' || en);
    mockDownload.mockImplementation(async () => void (en = true));
    await mount('vi-VN', 'en-US');
    await act(async () => packs.download());
    expect(mockDownload).toHaveBeenCalledTimes(1);
    expect(mockDownload).toHaveBeenCalledWith('en-US', { wifiOnly: false });
    expect(packs.status).toBe('ready');
  });

  it('shows downloading while it runs', async () => {
    mockIsDownloaded.mockResolvedValue(false);
    mockDownload.mockReturnValue(new Promise(() => undefined));
    await mount('vi-VN', 'en-US');
    await act(async () => packs.download());
    expect(packs.status).toBe('downloading');
  });

  it('a failed download reports an error and can be retried', async () => {
    mockIsDownloaded.mockResolvedValue(false);
    mockDownload.mockRejectedValueOnce(new Error('no network'));
    await mount('vi-VN', 'en-US');
    await act(async () => packs.download());
    expect(packs.status).toBe('error');
    expect(packs.error).toBe(PACK_DOWNLOAD_FAILED);

    mockDownload.mockResolvedValue(undefined);
    mockIsDownloaded.mockResolvedValue(true);
    await act(async () => packs.download());
    expect(packs.status).toBe('ready');
    expect(packs.error).toBeNull();
  });

  it('a failed check reports an error and recheck tries again', async () => {
    mockIsDownloaded.mockRejectedValueOnce(new Error('native'));
    mockIsDownloaded.mockResolvedValue(true);
    await mount('vi-VN', 'en-US');
    expect(packs.status).toBe('error');
    expect(packs.error).toBe(PACK_CHECK_FAILED);
    await act(async () => packs.recheck());
    expect(packs.status).toBe('ready');
  });

  it('is unavailable (not ready) in a build without the native module', async () => {
    mockAvailable.mockReturnValue(false);
    await mount('vi-VN', 'en-US');
    expect(packs.status).toBe('unavailable');
  });

  it('re-checks when the target changes', async () => {
    mockIsDownloaded.mockResolvedValue(true);
    const r = await mount('vi-VN', 'en-US');
    expect(packs.status).toBe('ready');
    await act(async () => r.update(<Harness language="vi-VN" translateTo={null} />));
    expect(packs.status).toBe('off');
  });

  describe('download timeout', () => {
    afterEach(() => jest.useRealTimers());

    it('a download that never finishes ends in the error state after 5 minutes, and can be retried', async () => {
      mockIsDownloaded.mockResolvedValue(false);
      await mount('vi-VN', 'en-US');
      jest.useFakeTimers();
      mockDownload.mockReturnValue(new Promise(() => undefined));
      await act(async () => packs.download());
      expect(packs.status).toBe('downloading');
      await act(async () => void (await jest.advanceTimersByTimeAsync(DOWNLOAD_TIMEOUT_MS - 1)));
      expect(packs.status).toBe('downloading');
      await act(async () => void (await jest.advanceTimersByTimeAsync(2)));
      expect(packs.status).toBe('error');
      expect(packs.error).toBe(PACK_DOWNLOAD_FAILED);

      mockDownload.mockResolvedValue(undefined);
      mockIsDownloaded.mockResolvedValue(true);
      await act(async () => packs.download());
      expect(packs.status).toBe('ready');
    });

    it('a download that finishes after the timeout cannot overwrite the error state', async () => {
      mockIsDownloaded.mockResolvedValue(false);
      await mount('vi-VN', 'en-US');
      jest.useFakeTimers();
      let finish!: () => void;
      mockDownload.mockReturnValue(new Promise<void>((r) => (finish = r)));
      await act(async () => packs.download());
      await act(async () => void (await jest.advanceTimersByTimeAsync(DOWNLOAD_TIMEOUT_MS + 1)));
      mockIsDownloaded.mockResolvedValue(true);
      await act(async () => finish());
      expect(packs.status).toBe('error');
    });

    it('a download finishing after the screen is gone touches nothing, and its watchdog is cancelled', async () => {
      mockIsDownloaded.mockResolvedValue(false);
      const r = await mount('vi-VN', 'en-US');
      jest.useFakeTimers();
      let finish!: () => void;
      mockDownload.mockReturnValue(new Promise<void>((res) => (finish = res)));
      await act(async () => packs.download());
      await act(async () => r.unmount());
      mounted.splice(mounted.indexOf(r), 1);
      const errors = jest.spyOn(console, 'error').mockImplementation(() => undefined);
      await act(async () => void (await jest.advanceTimersByTimeAsync(DOWNLOAD_TIMEOUT_MS + 1))); // the watchdog is gone
      mockIsDownloaded.mockClear();
      await act(async () => finish());
      expect(errors).not.toHaveBeenCalled();
      errors.mockRestore();
      expect(mockIsDownloaded).not.toHaveBeenCalled();
    });
  });
});
