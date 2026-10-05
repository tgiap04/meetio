const mockPut = jest.fn();
jest.mock('./axios-client', () => ({ apiClient: { put: (...a: unknown[]) => mockPut(...a) } }));

import { putSegmentTranslation } from './segment-translation';

beforeEach(() => jest.clearAllMocks());

describe('putSegmentTranslation', () => {
  it('PUTs the translation of that meeting and seq, guarded by the owner', async () => {
    mockPut.mockResolvedValue({ status: 204 });
    await putSegmentTranslation('u1', 'm1', 4, { translated_text: 'hello', translated_to: 'en-US' });
    expect(mockPut).toHaveBeenCalledWith('/meetings/m1/segments/4/translation', { translated_text: 'hello', translated_to: 'en-US' }, { expectedOwnerId: 'u1' });
  });

  it('passes a server refusal (404 / 400) through to the caller', async () => {
    const failure = new Error('Request failed with status code 404');
    mockPut.mockRejectedValue(failure);
    await expect(putSegmentTranslation(undefined, 'm1', 4, { translated_text: 'x', translated_to: 'vi-VN' })).rejects.toBe(failure);
  });
});
