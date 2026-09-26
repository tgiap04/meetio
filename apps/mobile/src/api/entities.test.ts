import { apiClient } from './axios-client';
import {
  deleteEntity,
  getEntity,
  getEntityTimeline,
  getMeetingGraph,
  listEntities,
  listMergeSuggestions,
  mergeEntities,
  rejectMergeSuggestion,
  undoMerge,
  updateEntity,
} from './entities';

jest.mock('./axios-client', () => ({
  apiClient: {
    get: jest.fn(),
    patch: jest.fn(),
    post: jest.fn(),
    delete: jest.fn(),
  },
}));

const mockedClient = apiClient as jest.Mocked<typeof apiClient>;

describe('entities api', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('lists entities with query params forwarded verbatim', async () => {
    mockedClient.get.mockResolvedValue({ data: { items: [], next_offset: null } });

    const result = await listEntities({ type: 'person,project', q: 'anh', limit: 20, offset: 0 });

    expect(mockedClient.get).toHaveBeenCalledWith('/entities', {
      params: { type: 'person,project', q: 'anh', limit: 20, offset: 0 },
    });
    expect(result).toEqual({ items: [], next_offset: null });
  });

  it('defaults the query to an empty object when omitted', async () => {
    mockedClient.get.mockResolvedValue({ data: { items: [], next_offset: null } });
    await listEntities();
    expect(mockedClient.get).toHaveBeenCalledWith('/entities', { params: {} });
  });

  it('propagates a rejected list request', async () => {
    mockedClient.get.mockRejectedValue(new Error('network down'));
    await expect(listEntities()).rejects.toThrow('network down');
  });

  it('fetches one entity by id', async () => {
    mockedClient.get.mockResolvedValue({ data: { id: 'e1' } });
    const result = await getEntity('e1');
    expect(mockedClient.get).toHaveBeenCalledWith('/entities/e1');
    expect(result).toEqual({ id: 'e1' });
  });

  it('fetches the timeline with paging params', async () => {
    mockedClient.get.mockResolvedValue({ data: { items: [], next_offset: null } });
    await getEntityTimeline('e1', { limit: 10, offset: 20 });
    expect(mockedClient.get).toHaveBeenCalledWith('/entities/e1/timeline', {
      params: { limit: 10, offset: 20 },
    });
  });

  it('patches an entity', async () => {
    mockedClient.patch.mockResolvedValue({ data: { id: 'e1', canonical_name: 'Mới' } });
    const result = await updateEntity('e1', { canonical_name: 'Mới' });
    expect(mockedClient.patch).toHaveBeenCalledWith('/entities/e1', { canonical_name: 'Mới' });
    expect(result).toEqual({ id: 'e1', canonical_name: 'Mới' });
  });

  it('deletes an entity', async () => {
    mockedClient.delete.mockResolvedValue({ data: undefined });
    await deleteEntity('e1');
    expect(mockedClient.delete).toHaveBeenCalledWith('/entities/e1');
  });

  it('lists merge suggestions', async () => {
    mockedClient.get.mockResolvedValue({ data: { items: [] } });
    const result = await listMergeSuggestions();
    expect(mockedClient.get).toHaveBeenCalledWith('/entities/merge-suggestions');
    expect(result).toEqual({ items: [] });
  });

  it('merges entities', async () => {
    mockedClient.post.mockResolvedValue({ data: { entity: { id: 'keep' }, merges: [] } });
    const result = await mergeEntities({ keep_id: 'keep', merge_ids: ['a', 'b'] });
    expect(mockedClient.post).toHaveBeenCalledWith('/entities/merge', {
      keep_id: 'keep',
      merge_ids: ['a', 'b'],
    });
    expect(result).toEqual({ entity: { id: 'keep' }, merges: [] });
  });

  it('undoes a merge', async () => {
    mockedClient.post.mockResolvedValue({ data: { id: 'keep' } });
    const result = await undoMerge('merge-1');
    expect(mockedClient.post).toHaveBeenCalledWith('/entities/merge/merge-1/undo');
    expect(result).toEqual({ id: 'keep' });
  });

  it('propagates a 409 when a merge undo has expired', async () => {
    const expired = Object.assign(new Error('expired'), {
      isAxiosError: true,
      response: { status: 409, data: { error: { code: 'INVALID_STATE_TRANSITION' } } },
    });
    mockedClient.post.mockRejectedValue(expired);
    await expect(undoMerge('merge-1')).rejects.toBe(expired);
  });

  it('rejects a merge suggestion', async () => {
    mockedClient.post.mockResolvedValue({ data: undefined });
    await rejectMergeSuggestion('s1');
    expect(mockedClient.post).toHaveBeenCalledWith('/entities/merge-suggestions/s1/reject');
  });

  it('fetches a meeting graph', async () => {
    mockedClient.get.mockResolvedValue({ data: { nodes: [], edges: [] } });
    const result = await getMeetingGraph('m1');
    expect(mockedClient.get).toHaveBeenCalledWith('/meetings/m1/graph');
    expect(result).toEqual({ nodes: [], edges: [] });
  });
});
