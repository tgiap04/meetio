import { apiClient } from './axios-client';
import {
  askGlobalQuestion,
  askMeetingQuestion,
  deleteGlobalQaHistory,
  deleteMeetingQaHistory,
  getGlobalQaHistory,
  getMeetingQaHistory,
} from './qa';

jest.mock('./axios-client', () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
    delete: jest.fn(),
  },
}));

const mockedClient = apiClient as jest.Mocked<typeof apiClient>;

describe('qa api', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('asks a question scoped to one meeting', async () => {
    const response = { question: { id: 'q1' }, answer: { id: 'a1' } };
    mockedClient.post.mockResolvedValue({ data: response });
    const result = await askMeetingQuestion('m1', { question: 'Ai phụ trách API?' });
    expect(mockedClient.post).toHaveBeenCalledWith('/meetings/m1/qa', { question: 'Ai phụ trách API?' });
    expect(result).toEqual(response);
  });

  it('propagates a rejected meeting question (e.g. 409 MEETING_NOT_READY)', async () => {
    mockedClient.post.mockRejectedValue(new Error('not ready'));
    await expect(askMeetingQuestion('m1', { question: 'x' })).rejects.toThrow('not ready');
  });

  it('fetches meeting Q&A history with before/limit forwarded verbatim', async () => {
    const response = { items: [], next_before: null };
    mockedClient.get.mockResolvedValue({ data: response });
    await getMeetingQaHistory('m1', { before: '2026-05-01T00:00:00.000Z', limit: 50 });
    expect(mockedClient.get).toHaveBeenCalledWith('/meetings/m1/qa', {
      params: { before: '2026-05-01T00:00:00.000Z', limit: 50 },
    });
  });

  it('defaults the meeting history query to an empty object when omitted', async () => {
    mockedClient.get.mockResolvedValue({ data: { items: [], next_before: null } });
    await getMeetingQaHistory('m1');
    expect(mockedClient.get).toHaveBeenCalledWith('/meetings/m1/qa', { params: {} });
  });

  it('deletes a meeting Q&A history', async () => {
    mockedClient.delete.mockResolvedValue({ data: undefined });
    await deleteMeetingQaHistory('m1');
    expect(mockedClient.delete).toHaveBeenCalledWith('/meetings/m1/qa');
  });

  it('asks a global, cross-meeting question with its filters', async () => {
    const response = { question: { id: 'q1' }, answer: { id: 'a1' } };
    mockedClient.post.mockResolvedValue({ data: response });
    const result = await askGlobalQuestion({ question: 'Ai phụ trách API?', entity_id: 'e1' });
    expect(mockedClient.post).toHaveBeenCalledWith('/qa', { question: 'Ai phụ trách API?', entity_id: 'e1' });
    expect(result).toEqual(response);
  });

  it('fetches the global Q&A history', async () => {
    const response = { items: [], next_before: 'cursor' };
    mockedClient.get.mockResolvedValue({ data: response });
    const result = await getGlobalQaHistory({ limit: 50 });
    expect(mockedClient.get).toHaveBeenCalledWith('/qa', { params: { limit: 50 } });
    expect(result).toEqual(response);
  });

  it('deletes the global Q&A history', async () => {
    mockedClient.delete.mockResolvedValue({ data: undefined });
    await deleteGlobalQaHistory();
    expect(mockedClient.delete).toHaveBeenCalledWith('/qa');
  });

  it('propagates a rejected delete', async () => {
    mockedClient.delete.mockRejectedValue(new Error('cannot delete'));
    await expect(deleteGlobalQaHistory()).rejects.toThrow('cannot delete');
  });
});
