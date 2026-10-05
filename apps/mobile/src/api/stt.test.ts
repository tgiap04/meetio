import { AxiosError } from 'axios';

const mockPost = jest.fn();
jest.mock('./axios-client', () => ({ apiClient: { post: (...a: unknown[]) => mockPost(...a) } }));
const mockGetMe = jest.fn();
jest.mock('./users', () => ({ getMe: () => mockGetMe() }));

import { isServerReachable, transcribeAudioChunk } from './stt';

const MEETING = { ownerId: 'u1', meetingId: 'meeting-1' };

beforeEach(() => jest.clearAllMocks());
afterEach(() => jest.restoreAllMocks());

describe('transcribeAudioChunk', () => {
  it('posts the chunk as multipart with the audio part and language, and returns the text', async () => {
    mockPost.mockResolvedValue({ data: { text: 'xin chào' } });
    // The test runtime's FormData is not React Native's, so record what is appended instead of reading it back.
    const appended: [string, unknown][] = [];
    jest.spyOn(FormData.prototype, 'append').mockImplementation((name: string, value: unknown) => void appended.push([name, value]));
    await expect(transcribeAudioChunk('file:///cache/c.m4a', 'vi-VN', MEETING)).resolves.toBe('xin chào');
    const [url, , config] = mockPost.mock.calls[0] as [string, FormData, { headers: Record<string, string>; timeout: number; expectedOwnerId: string }];
    expect(url).toBe('/stt/transcribe');
    expect(appended).toEqual([
      ['audio', { uri: 'file:///cache/c.m4a', name: 'chunk.m4a', type: 'audio/mp4' }],
      ['language', 'vi-VN'],
      ['meeting_id', 'meeting-1'],
    ]);
    expect(config.headers['Content-Type']).toBe('multipart/form-data');
    expect(config.timeout).toBeGreaterThan(15_000);
    expect(config.expectedOwnerId).toBe('u1'); // the owner guard applies to audio uploads too
  });

  it('returns an empty string for a chunk without speech', async () => {
    mockPost.mockResolvedValue({ data: { text: '' } });
    await expect(transcribeAudioChunk('file:///c.m4a', 'en-US', MEETING)).resolves.toBe('');
  });

  it('rejects a language the server does not accept, without calling it', async () => {
    await expect(transcribeAudioChunk('file:///c.m4a', 'ja-JP', MEETING)).rejects.toThrow('Unsupported recognition language');
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('rejects a response without text', async () => {
    mockPost.mockResolvedValue({ data: {} });
    await expect(transcribeAudioChunk('file:///c.m4a', 'vi-VN', MEETING)).rejects.toThrow('Malformed');
  });

  it('lets request failures through for the caller to turn into a gap', async () => {
    mockPost.mockRejectedValue(new AxiosError('Network Error'));
    await expect(transcribeAudioChunk('file:///c.m4a', 'vi-VN', MEETING)).rejects.toThrow('Network Error');
  });
});

describe('isServerReachable', () => {
  it('is true when the API answers', async () => {
    mockGetMe.mockResolvedValue({});
    await expect(isServerReachable()).resolves.toBe(true);
  });

  it('is false on a network failure (no response)', async () => {
    mockGetMe.mockRejectedValue(new AxiosError('Network Error', 'ERR_NETWORK'));
    await expect(isServerReachable()).resolves.toBe(false);
  });

  it('is true when the API answers with an error status — it is reachable', async () => {
    const error = new AxiosError('Server Error', 'ERR_BAD_RESPONSE', undefined, undefined, { status: 500 } as never);
    mockGetMe.mockRejectedValue(error);
    await expect(isServerReachable()).resolves.toBe(true);
  });

  it('is true for a non-HTTP error such as an owner mismatch', async () => {
    mockGetMe.mockRejectedValue(new Error('boom'));
    await expect(isServerReachable()).resolves.toBe(true);
  });
});
