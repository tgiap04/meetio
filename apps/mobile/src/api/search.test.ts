import { apiClient } from './axios-client';
import { searchTranscripts } from './search';

jest.mock('./axios-client', () => ({
  apiClient: {
    get: jest.fn(),
  },
}));

const mockedClient = apiClient as jest.Mocked<typeof apiClient>;

describe('search api', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('forwards the query params verbatim to GET /search', async () => {
    mockedClient.get.mockResolvedValue({ data: { items: [], next_offset: null } });

    const result = await searchTranscripts({ q: 'ngân sách', limit: 20, offset: 0 });

    expect(mockedClient.get).toHaveBeenCalledWith('/search', {
      params: { q: 'ngân sách', limit: 20, offset: 0 },
    });
    expect(result).toEqual({ items: [], next_offset: null });
  });

  it('returns the items and next_offset from the response body', async () => {
    const item = {
      chunk_id: 'c1',
      meeting_id: 'm1',
      meeting_title: 'Sprint Review',
      meeting_date: '2026-01-15T09:00:00.000Z',
      excerpt: '...bàn về ngân sách...',
      segment_seq: 12,
      segment_end_seq: 14,
      score: 0.82,
    };
    mockedClient.get.mockResolvedValue({ data: { items: [item], next_offset: 20 } });

    const result = await searchTranscripts({ q: 'ngân sách' });

    expect(result.items).toEqual([item]);
    expect(result.next_offset).toBe(20);
  });

  it('propagates a rejected request (e.g. 503 AI_SERVICE_UNAVAILABLE)', async () => {
    const unavailable = Object.assign(new Error('unavailable'), {
      isAxiosError: true,
      response: { status: 503, data: { error: { code: 'AI_SERVICE_UNAVAILABLE' } } },
    });
    mockedClient.get.mockRejectedValue(unavailable);

    await expect(searchTranscripts({ q: 'x' })).rejects.toBe(unavailable);
  });
});
