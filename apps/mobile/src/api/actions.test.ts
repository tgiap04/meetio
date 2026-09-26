import { apiClient } from './axios-client';
import {
  createActionItem,
  deleteActionItem,
  getActionFilters,
  getMeetingActions,
  listActions,
  updateActionItem,
} from './actions';

jest.mock('./axios-client', () => ({
  apiClient: {
    get: jest.fn(),
    patch: jest.fn(),
    post: jest.fn(),
    delete: jest.fn(),
  },
}));

const mockedClient = apiClient as jest.Mocked<typeof apiClient>;

describe('actions api', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fetches one meeting\'s action items', async () => {
    mockedClient.get.mockResolvedValue({ data: { items: [{ id: 'a1' }] } });
    const result = await getMeetingActions('m1');
    expect(mockedClient.get).toHaveBeenCalledWith('/meetings/m1/actions');
    expect(result).toEqual({ items: [{ id: 'a1' }] });
  });

  it('lists the cross-meeting actions with query params forwarded verbatim', async () => {
    mockedClient.get.mockResolvedValue({ data: { items: [], next_offset: null } });
    await listActions({ status: 'open', assignee_entity_id: 'e1', meeting_id: 'm1', limit: 20, offset: 0 });
    expect(mockedClient.get).toHaveBeenCalledWith('/actions', {
      params: { status: 'open', assignee_entity_id: 'e1', meeting_id: 'm1', limit: 20, offset: 0 },
    });
  });

  it('defaults the actions-list query to an empty object when omitted', async () => {
    mockedClient.get.mockResolvedValue({ data: { items: [], next_offset: null } });
    await listActions();
    expect(mockedClient.get).toHaveBeenCalledWith('/actions', { params: {} });
  });

  it('propagates a rejected actions-list request', async () => {
    mockedClient.get.mockRejectedValue(new Error('network down'));
    await expect(listActions()).rejects.toThrow('network down');
  });

  it('fetches the action filters (open total, assignees, meetings)', async () => {
    const response = {
      open_total: 5,
      assignees: [{ id: 'e1', canonical_name: 'Bình', open_count: 2 }],
      meetings: [{ id: 'm1', title: 'Sprint Review', started_at: '2026-05-01T00:00:00.000Z', open_count: 3 }],
    };
    mockedClient.get.mockResolvedValue({ data: response });
    const result = await getActionFilters();
    expect(mockedClient.get).toHaveBeenCalledWith('/actions/filters');
    expect(result).toEqual(response);
  });

  it('creates a manual action item scoped to a meeting', async () => {
    mockedClient.post.mockResolvedValue({ data: { id: 'a1', content: 'Gửi báo cáo' } });
    const result = await createActionItem('m1', { content: 'Gửi báo cáo' });
    expect(mockedClient.post).toHaveBeenCalledWith('/meetings/m1/actions', { content: 'Gửi báo cáo' });
    expect(result).toEqual({ id: 'a1', content: 'Gửi báo cáo' });
  });

  it('patches an action item', async () => {
    mockedClient.patch.mockResolvedValue({ data: { id: 'a1', status: 'done' } });
    const result = await updateActionItem('a1', { status: 'done' });
    expect(mockedClient.patch).toHaveBeenCalledWith('/actions/a1', { status: 'done' });
    expect(result).toEqual({ id: 'a1', status: 'done' });
  });

  it('deletes an action item', async () => {
    mockedClient.delete.mockResolvedValue({ data: undefined });
    await deleteActionItem('a1');
    expect(mockedClient.delete).toHaveBeenCalledWith('/actions/a1');
  });

  it('propagates a rejected delete', async () => {
    mockedClient.delete.mockRejectedValue(new Error('cannot delete'));
    await expect(deleteActionItem('a1')).rejects.toThrow('cannot delete');
  });
});
