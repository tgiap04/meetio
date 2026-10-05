const mockPost = jest.fn();
jest.mock('./axios-client', () => ({ apiClient: { post: (...a: unknown[]) => mockPost(...a) } }));

import { retrySegmentTranslation } from './segment-translation';

beforeEach(() => jest.clearAllMocks());

describe('retrySegmentTranslation', () => {
  it('POSTs the retry endpoint for that meeting and seq and returns the translation', async () => {
    mockPost.mockResolvedValue({ data: { seq: 4, translated_text: 'hello', translated_to: 'en-US' } });
    await expect(retrySegmentTranslation('m1', 4)).resolves.toEqual({ seq: 4, translated_text: 'hello', translated_to: 'en-US' });
    expect(mockPost).toHaveBeenCalledWith('/meetings/m1/segments/4/translate');
  });

  it('rejects when the server answer is not a translation of that seq (never trust the wire)', async () => {
    mockPost.mockResolvedValue({ data: { seq: 9, translated_text: 'x', translated_to: 'en-US' } });
    await expect(retrySegmentTranslation('m1', 4)).rejects.toThrow('Unexpected translation response');
    mockPost.mockResolvedValue({ data: { seq: 4, translated_text: 5, translated_to: 'en-US' } });
    await expect(retrySegmentTranslation('m1', 4)).rejects.toThrow('Unexpected translation response');
  });

  it('passes a server failure (503 / 429 / 404) through to the caller', async () => {
    const failure = new Error('Request failed with status code 503');
    mockPost.mockRejectedValue(failure);
    await expect(retrySegmentTranslation('m1', 4)).rejects.toBe(failure);
  });
});
