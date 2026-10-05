import TestRenderer, { act } from 'react-test-renderer';
import { QueryClient, QueryClientProvider, type InfiniteData } from '@tanstack/react-query';
import type { ListMeetingsResponse, MeetingDetailResponse } from '@meetio/shared';
import { updateMeeting } from '../api/meetings';
import { MEETINGS_QUERY_KEY } from './use-meetings-query';
import { meetingQueryKey } from './use-meeting-detail-query';
import { RENAME_ERROR_MESSAGE, useRenameMeetingDialog } from './use-rename-meeting';

jest.mock('../api/meetings', () => ({ updateMeeting: jest.fn() }));
const mockedUpdate = updateMeeting as jest.Mock;

type Dialog = ReturnType<typeof useRenameMeetingDialog>;
let dialog: Dialog;
function Harness() {
  dialog = useRenameMeetingDialog();
  return null;
}

const listKey = [...MEETINGS_QUERY_KEY, { limit: 20 }] as const;
const searchKey = [...MEETINGS_QUERY_KEY, { q: 'x' }] as const;

function list(): InfiniteData<ListMeetingsResponse> {
  const item = (id: string, title: string) => ({ id, title }) as ListMeetingsResponse['items'][number];
  return {
    pages: [
      { items: [item('m1', 'Old'), item('m2', 'Other')], next_cursor: 'c' },
      { items: [item('m3', 'Third')], next_cursor: null },
    ],
    pageParams: [null, 'c'],
  };
}

const titlesOf = (data: InfiniteData<ListMeetingsResponse> | undefined) =>
  data?.pages.flatMap((p) => p.items.map((i) => i.title));

let renderer: TestRenderer.ReactTestRenderer;
let client: QueryClient;

function setup() {
  client = new QueryClient({
    defaultOptions: { queries: { gcTime: Infinity, retry: false }, mutations: { gcTime: Infinity, retry: false } },
  });
  client.setQueryData(listKey, list());
  client.setQueryData(searchKey, list());
  client.setQueryData(meetingQueryKey('m1'), { id: 'm1', title: 'Old' } as MeetingDetailResponse);
  act(() => {
    renderer = TestRenderer.create(
      <QueryClientProvider client={client}>
        <Harness />
      </QueryClientProvider>,
    );
  });
  act(() => dialog.open({ id: 'm1', title: 'Old' }));
}

async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 10));
  });
}

describe('useRenameMeetingDialog / useRenameMeeting', () => {
  beforeEach(() => mockedUpdate.mockReset());
  afterEach(() => {
    act(() => renderer.unmount());
    client.clear();
  });

  it('opens with the target meeting and closes on cancel', () => {
    setup();
    expect(dialog.dialogProps).toMatchObject({ visible: true, initialTitle: 'Old' });
    act(() => dialog.dialogProps.onCancel());
    expect(dialog.dialogProps.visible).toBe(false);
  });

  it('optimistically renames in every list cache and the detail cache before the server answers', async () => {
    setup();
    let resolve!: (v: unknown) => void;
    mockedUpdate.mockReturnValue(new Promise((r) => (resolve = r)));
    act(() => dialog.dialogProps.onSave('New'));
    await flush();
    expect(titlesOf(client.getQueryData(listKey))).toEqual(['New', 'Other', 'Third']);
    expect(titlesOf(client.getQueryData(searchKey))).toEqual(['New', 'Other', 'Third']);
    expect(client.getQueryData<MeetingDetailResponse>(meetingQueryKey('m1'))?.title).toBe('New');
    expect(dialog.dialogProps.saving).toBe(true);
    expect(dialog.dialogProps.visible).toBe(true);
    await act(async () => resolve({ id: 'm1', title: 'New' }));
    await flush();
    expect(mockedUpdate).toHaveBeenCalledWith('m1', { title: 'New' });
    expect(dialog.dialogProps.visible).toBe(false);
  });

  it('rolls back caches, keeps the dialog open and exposes the error without rejecting', async () => {
    setup();
    mockedUpdate.mockRejectedValue(new Error('network'));
    const unhandled = jest.fn();
    process.on('unhandledRejection', unhandled);
    act(() => dialog.dialogProps.onSave('New'));
    await flush();
    process.off('unhandledRejection', unhandled);
    expect(unhandled).not.toHaveBeenCalled();
    expect(titlesOf(client.getQueryData(listKey))).toEqual(['Old', 'Other', 'Third']);
    expect(client.getQueryData<MeetingDetailResponse>(meetingQueryKey('m1'))?.title).toBe('Old');
    expect(dialog.dialogProps.visible).toBe(true);
    expect(dialog.dialogProps.errorMessage).toBe(RENAME_ERROR_MESSAGE);
    expect(dialog.dialogProps.saving).toBe(false);
  });

  it('clears the error when reopened', async () => {
    setup();
    mockedUpdate.mockRejectedValue(new Error('network'));
    act(() => dialog.dialogProps.onSave('New'));
    await flush();
    act(() => dialog.open({ id: 'm1', title: 'Old' }));
    expect(dialog.dialogProps.errorMessage).toBeNull();
  });

  it('does not optimistically write a blank title and sends an empty string', async () => {
    setup();
    mockedUpdate.mockResolvedValue({ id: 'm1', title: 'Cuộc họp 05/10 09:00' });
    act(() => dialog.dialogProps.onSave(''));
    await flush();
    expect(mockedUpdate).toHaveBeenCalledWith('m1', { title: '' });
    expect(titlesOf(client.getQueryData(listKey))?.[0]).not.toBe('');
  });

  it('invalidates list and detail queries after settling', async () => {
    setup();
    const spy = jest.spyOn(client, 'invalidateQueries');
    mockedUpdate.mockResolvedValue({});
    act(() => dialog.dialogProps.onSave('New'));
    await flush();
    const keys = spy.mock.calls.map((c) => c[0]?.queryKey);
    expect(keys).toEqual(expect.arrayContaining([MEETINGS_QUERY_KEY, meetingQueryKey('m1')]));
  });

  it('updates {items} caches, ignores array caches, and rolls back all of them', async () => {
    setup();
    const plainKey = [...MEETINGS_QUERY_KEY, 'recent'] as const;
    const arrayKey = [...MEETINGS_QUERY_KEY, 'unfinished'] as const;
    const plain = { items: [{ id: 'm1', title: 'Old' }, { id: 'm2', title: 'Other' }], next_cursor: null };
    const arr = [{ id: 'm1', title: 'Old' }];
    client.setQueryData(plainKey, plain);
    client.setQueryData(arrayKey, arr);
    let reject!: (e: Error) => void;
    mockedUpdate.mockReturnValue(new Promise((_, r) => (reject = r)));
    act(() => dialog.dialogProps.onSave('New'));
    await flush();
    expect(client.getQueryData<typeof plain>(plainKey)?.items.map((i) => i.title)).toEqual(['New', 'Other']);
    expect(client.getQueryData(arrayKey)).toEqual(arr);
    await act(async () => reject(new Error('x')));
    await flush();
    expect(client.getQueryData<typeof plain>(plainKey)?.items.map((i) => i.title)).toEqual(['Old', 'Other']);
    expect(client.getQueryData(arrayKey)).toEqual(arr);
  });

  it('rollback leaves another meeting\'s overlapping optimistic title untouched', async () => {
    setup();
    let reject!: (e: Error) => void;
    mockedUpdate.mockReturnValue(new Promise((_, r) => (reject = r)));
    act(() => dialog.dialogProps.onSave('New'));
    await flush();
    // Simulate a concurrent optimistic rename of m2 written after ours.
    client.setQueryData<InfiniteData<ListMeetingsResponse>>(listKey, (old) => ({
      ...old!,
      pages: old!.pages.map((p) => ({
        ...p,
        items: p.items.map((i) => (i.id === 'm2' ? { ...i, title: 'Other renamed' } : i)),
      })),
    }));
    await act(async () => reject(new Error('x')));
    await flush();
    expect(titlesOf(client.getQueryData(listKey))).toEqual(['Old', 'Other renamed', 'Third']);
  });
});
