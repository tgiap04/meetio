import TestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/** Home's recording banners (US-15) over the real on-disk queue (node:sqlite behind expo-sqlite). */
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ router: { push: (...a: unknown[]) => mockPush(...a) } }));
jest.mock('../../hooks/use-me-query', () => ({ useMeQuery: () => ({ data: { user: { id: 'u1' } } }) }));

const mockListMeetings = jest.fn();
jest.mock('../../api/meetings', () => ({ listMeetings: (q: { status: string }) => mockListMeetings(q) }));
const mockTransition = jest.fn(async () => ({}));
jest.mock('../../api/recording', () => ({ transitionMeeting: (...a: unknown[]) => mockTransition(...(a as [])) }));

const mockResumeUnfinished = jest.fn(async (_id: string) => undefined);
const mockKick = jest.fn();
jest.mock('../../recording/recording-runtime', () => ({
  getRecordingRuntime: async () => ({ session: { resumeUnfinished: (id: string) => mockResumeUnfinished(id) }, worker: { kick: mockKick } }),
}));

import { RecordingBanners } from './recording-banners';
import { openQueueDb } from '../../queue/queue-db';
import { insertLocalMeeting } from '../../queue/local-meetings';
import { nextOp } from '../../queue/lifecycle-ops';
import { enqueueSegment } from '../../queue/segment-queue';
import { resetRecordingStore, useRecordingStore } from '../../recording/recording.store';
import { RECORDING_LIVE_ROUTE } from '../../navigation/app-routes';

const BODY = { source_language: 'vi-VN', translate_to: null, audio_source: 'device_mic', recording_quality: 'high' } as const;
const serverItem = (id: string, status: string) => ({
  id,
  title: 't',
  status,
  source_language: 'en-US',
  translate_to: null,
  started_at: '2026-09-27T01:00:00.000Z',
  ended_at: null,
  duration_sec: null,
  created_at: '2026-09-27T01:00:00.000Z',
});

const mounted: TestRenderer.ReactTestRenderer[] = [];
// gcTime timers (5 min) would otherwise keep Jest alive long after the last test.
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
afterEach(() => {
  act(() => mounted.splice(0).forEach((r) => r.unmount()));
  queryClient.clear();
});

async function render() {
  let r!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    r = TestRenderer.create(
      <QueryClientProvider client={queryClient}>
        <RecordingBanners ownerId="u1" />
      </QueryClientProvider>,
    );
  });
  await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
  mounted.push(r);
  return r;
}
const texts = (r: TestRenderer.ReactTestRenderer) => r.root.findAllByType(Text).map((t) => [t.props.children].flat().join(''));

describe('Home recording banners', () => {
  const id = 'local-1';
  beforeEach(async () => {
    jest.clearAllMocks();
    resetRecordingStore();
    mockListMeetings.mockResolvedValue({ items: [], next_cursor: null });
    // One database for the whole file (openQueueDb is a singleton) — empty it between tests.
    await (await openQueueDb()).execAsync('DELETE FROM pending_segments; DELETE FROM pending_ops; DELETE FROM local_meetings;');
  });

  it('offers to continue or end a meeting the app died in, with its unsynced count', async () => {
    const db = await openQueueDb();
    await insertLocalMeeting(db, { id, ownerId: 'u1', startedAt: Date.UTC(2026, 8, 27, 2, 30), createBody: BODY });
    await enqueueSegment(db, id, { text: 'x', started_at_ms: 0, ended_at_ms: 1 });
    const r = await render();

    expect(r.root.findAllByProps({ testID: `unfinished-${id}` }).length).toBeGreaterThan(0);
    expect(texts(r)).toContain('Có cuộc họp chưa kết thúc');
    expect(texts(r).join(' ')).toContain('1 đoạn chưa đồng bộ, vẫn giữ trên máy');

    await act(async () => r.root.findAllByProps({ label: 'Tiếp tục ghi' })[0].props.onPress());
    expect(mockResumeUnfinished).toHaveBeenCalledWith(id);
    expect(mockPush).toHaveBeenCalledWith(RECORDING_LIVE_ROUTE);
  });

  it('"Kết thúc" on a local meeting queues `end` and lets the sync worker finish it', async () => {
    const db = await openQueueDb();
    await insertLocalMeeting(db, { id, ownerId: 'u1', startedAt: Date.now(), createBody: BODY });
    const r = await render();
    await act(async () => r.root.findAll((node) => node.props.label === 'Kết thúc' && node.props.onPress)[0].props.onPress());
    expect(await nextOp(db, id)).toMatchObject({ op: 'end' });
    expect(mockKick).toHaveBeenCalled();
    expect(mockTransition).not.toHaveBeenCalled();
  });

  it('shows a meeting left open on the server (another device) and ends it there', async () => {
    mockListMeetings.mockImplementation(async (q: { status: string }) => ({
      items: q.status === 'recording' ? [serverItem('srv-1', 'recording')] : [],
      next_cursor: null,
    }));
    const r = await render();
    expect(r.root.findAllByProps({ testID: 'unfinished-srv-1' }).length).toBeGreaterThan(0);
    await act(async () => r.root.findAll((node) => node.props.label === 'Kết thúc' && node.props.onPress)[0].props.onPress());
    expect(mockTransition).toHaveBeenCalledWith('srv-1', 'end', { at: expect.any(String) });
  });

  it('lists a meeting known both locally and on the server once', async () => {
    const db = await openQueueDb();
    await insertLocalMeeting(db, { id, ownerId: 'u1', startedAt: Date.now(), createBody: BODY, serverCreated: true });
    mockListMeetings.mockResolvedValue({ items: [serverItem(id, 'recording')], next_cursor: null });
    const r = await render();
    expect(texts(r).filter((t) => t === 'Có cuộc họp chưa kết thúc').length).toBe(1);
  });

  it('a meeting already ended and still syncing shows progress, not choices', async () => {
    const db = await openQueueDb();
    await insertLocalMeeting(db, { id, ownerId: 'u1', startedAt: Date.now(), createBody: BODY, status: 'ending' });
    const r = await render();
    expect(texts(r).join(' ')).toContain('đang đồng bộ');
    expect(r.root.findAllByProps({ label: 'Tiếp tục ghi' }).length).toBe(0);
  });

  it("never shows another user's queued meeting", async () => {
    const db = await openQueueDb();
    await insertLocalMeeting(db, { id, ownerId: 'someone-else', startedAt: Date.now(), createBody: BODY });
    const r = await render();
    expect(r.root.findAllByProps({ testID: `unfinished-${id}` }).length).toBe(0);
  });

  it('the minimised live recording links back to screen 06, and blocks resuming a second one', async () => {
    const db = await openQueueDb();
    await insertLocalMeeting(db, { id, ownerId: 'u1', startedAt: Date.now(), createBody: BODY });
    useRecordingStore.setState({ phase: 'recording', meetingId: 'live', startedAt: Date.now() });
    const r = await render();
    act(() => r.root.findByProps({ testID: 'active-recording-banner' }).props.onPress());
    expect(mockPush).toHaveBeenCalledWith(RECORDING_LIVE_ROUTE);
    expect(r.root.findAllByProps({ label: 'Tiếp tục ghi' })[0].props.disabled).toBe(true);
  });
});
