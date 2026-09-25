import { apiClient } from './axios-client';
import {
  deleteMeeting,
  exportMeeting,
  getMeeting,
  getMeetingStatus,
  listMeetings,
  listSegments,
  reindexMeeting,
  updateMeeting,
  updateSegment,
} from './meetings';

jest.mock('./axios-client', () => ({
  apiClient: {
    get: jest.fn(),
    patch: jest.fn(),
    post: jest.fn(),
    delete: jest.fn(),
  },
}));

const mockedClient = apiClient as jest.Mocked<typeof apiClient>;

describe('meetings api', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('lists meetings with query params forwarded verbatim', async () => {
    mockedClient.get.mockResolvedValue({ data: { items: [], next_cursor: null } });

    const result = await listMeetings({ limit: 20, q: 'standup' });

    expect(mockedClient.get).toHaveBeenCalledWith('/meetings', {
      params: { limit: 20, q: 'standup' },
    });
    expect(result).toEqual({ items: [], next_cursor: null });
  });

  it('defaults the query to an empty object when omitted', async () => {
    mockedClient.get.mockResolvedValue({ data: { items: [], next_cursor: null } });

    await listMeetings();

    expect(mockedClient.get).toHaveBeenCalledWith('/meetings', { params: {} });
  });

  it('propagates a rejected list request', async () => {
    mockedClient.get.mockRejectedValue(new Error('network down'));

    await expect(listMeetings()).rejects.toThrow('network down');
  });

  it('fetches one meeting by id', async () => {
    mockedClient.get.mockResolvedValue({ data: { id: 'm1' } });

    const result = await getMeeting('m1');

    expect(mockedClient.get).toHaveBeenCalledWith('/meetings/m1');
    expect(result).toEqual({ id: 'm1' });
  });

  it('patches a meeting title', async () => {
    mockedClient.patch.mockResolvedValue({ data: { id: 'm1', title: 'New title' } });

    const result = await updateMeeting('m1', { title: 'New title' });

    expect(mockedClient.patch).toHaveBeenCalledWith('/meetings/m1', { title: 'New title' });
    expect(result).toEqual({ id: 'm1', title: 'New title' });
  });

  it('deletes a meeting by id', async () => {
    mockedClient.delete.mockResolvedValue({ data: undefined });

    await deleteMeeting('m1');

    expect(mockedClient.delete).toHaveBeenCalledWith('/meetings/m1');
  });

  it('lists segments with pagination params', async () => {
    mockedClient.get.mockResolvedValue({ data: { items: [], next_from_seq: null } });

    await listSegments('m1', { from_seq: 10, limit: 50 });

    expect(mockedClient.get).toHaveBeenCalledWith('/meetings/m1/segments', {
      params: { from_seq: 10, limit: 50 },
    });
  });

  it('patches a segment by id', async () => {
    mockedClient.patch.mockResolvedValue({ data: { id: 's1', text: 'fixed' } });

    const result = await updateSegment('s1', { text: 'fixed' });

    expect(mockedClient.patch).toHaveBeenCalledWith('/segments/s1', { text: 'fixed' });
    expect(result).toEqual({ id: 's1', text: 'fixed' });
  });

  it('propagates a 409 from a segment edit made mid-recording', async () => {
    const conflict = Object.assign(new Error('conflict'), {
      isAxiosError: true,
      response: { status: 409, data: { error: { code: 'INVALID_STATE_TRANSITION' } } },
    });
    mockedClient.patch.mockRejectedValue(conflict);

    await expect(updateSegment('s1', { text: 'fixed' })).rejects.toBe(conflict);
  });

  it('requests a reindex with the given scope', async () => {
    mockedClient.post.mockResolvedValue({ data: { id: 'm1', status: 'queued', duration_sec: 120 } });

    const result = await reindexMeeting('m1', { scope: 'changed' });

    expect(mockedClient.post).toHaveBeenCalledWith('/meetings/m1/reindex', { scope: 'changed' });
    expect(result).toEqual({ id: 'm1', status: 'queued', duration_sec: 120 });
  });

  it('fetches meeting status', async () => {
    mockedClient.get.mockResolvedValue({
      data: { meeting_id: 'm1', status: 'processing', current_step: 'embed', steps: [], failure_reason: null, has_unprocessed_edits: false },
    });

    const result = await getMeetingStatus('m1');

    expect(mockedClient.get).toHaveBeenCalledWith('/meetings/m1/status');
    expect(result.status).toBe('processing');
  });

  it('exports a meeting as a raw text body', async () => {
    mockedClient.get.mockResolvedValue({ data: '# Meeting\n\nSummary text' });

    const result = await exportMeeting('m1', { format: 'markdown', include: 'summary,actions' });

    expect(mockedClient.get).toHaveBeenCalledWith('/meetings/m1/export', expect.objectContaining({
      params: { format: 'markdown', include: 'summary,actions' },
      responseType: 'text',
    }));
    expect(result).toBe('# Meeting\n\nSummary text');
  });
});
