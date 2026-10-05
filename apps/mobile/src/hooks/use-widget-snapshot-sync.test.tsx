import TestRenderer, { act } from 'react-test-renderer';
import { MeetingStatus } from '@meetio/shared';
import { useWidgetSignedOutSync, useWidgetSnapshotSync, WIDGET_SYNC_DEBOUNCE_MS } from './use-widget-snapshot-sync';
import { useRecentMeetingsQuery } from './use-recent-meetings-query';
import { useActionFiltersQuery } from './use-action-filters-query';
import { publishWidgetSnapshot } from '../widget/widget-publisher';
import { SIGNED_OUT_SNAPSHOT } from '../widget/widget-snapshot';
import { resetRecordingStore, useRecordingStore } from '../recording/recording.store';
import { resetAppLockStore, useAppLockStore } from '../security/app-lock.store';
import { useSessionStore } from '../store/session.store';

jest.mock('./use-recent-meetings-query', () => ({ useRecentMeetingsQuery: jest.fn() }));
jest.mock('./use-action-filters-query', () => ({ useActionFiltersQuery: jest.fn() }));
jest.mock('../widget/widget-publisher', () => ({ publishWidgetSnapshot: jest.fn(async () => {}) }));

const recent = useRecentMeetingsQuery as jest.Mock;
const filters = useActionFiltersQuery as jest.Mock;
const publish = publishWidgetSnapshot as jest.Mock;
const meeting = { id: 'm1', title: 'Họp A', status: MeetingStatus.READY };
const mounted: TestRenderer.ReactTestRenderer[] = [];

function Probe() {
  useWidgetSnapshotSync(() => 42);
  return null;
}
function SignedOutProbe() {
  useWidgetSignedOutSync();
  return null;
}
function mount(el: React.ReactElement) {
  act(() => {
    mounted.push(TestRenderer.create(el));
  });
}
const lastSnapshot = () => publish.mock.calls.at(-1)?.[0];

beforeEach(() => {
  jest.useFakeTimers();
  publish.mockClear();
  resetRecordingStore();
  resetAppLockStore();
  useAppLockStore.setState({ status: 'ready' });
  recent.mockReturnValue({ data: { items: [meeting], next_cursor: null } });
  filters.mockReturnValue({ data: { open_total: 3 } });
});
afterEach(() => {
  act(() => mounted.splice(0).forEach((t) => t.unmount()));
  jest.useRealTimers();
});

it('publishes once after the debounce with the latest meeting and the open count', () => {
  mount(<Probe />);
  expect(publish).not.toHaveBeenCalled();
  act(() => jest.advanceTimersByTime(WIDGET_SYNC_DEBOUNCE_MS));
  expect(publish).toHaveBeenCalledTimes(1);
  expect(lastSnapshot()).toMatchObject({
    signedIn: true,
    recording: false,
    openActions: 3,
    lastMeeting: { id: 'm1', title: 'Họp A' },
    updatedAt: 42,
  });
});

it('republishes when recording starts, and not again for an unchanged state', () => {
  mount(<Probe />);
  act(() => jest.advanceTimersByTime(WIDGET_SYNC_DEBOUNCE_MS));
  act(() => useRecordingStore.setState({ phase: 'recording' }));
  act(() => jest.advanceTimersByTime(WIDGET_SYNC_DEBOUNCE_MS));
  expect(publish).toHaveBeenCalledTimes(2);
  expect(lastSnapshot().recording).toBe(true);

  act(() => useRecordingStore.setState({ phase: 'paused' }));
  act(() => jest.advanceTimersByTime(WIDGET_SYNC_DEBOUNCE_MS));
  expect(publish).toHaveBeenCalledTimes(2);
});

it('drops the meeting title once the app lock is turned on', async () => {
  mount(<Probe />);
  act(() => jest.advanceTimersByTime(WIDGET_SYNC_DEBOUNCE_MS));
  await act(async () => useAppLockStore.getState().setEnabled(true));
  act(() => jest.advanceTimersByTime(WIDGET_SYNC_DEBOUNCE_MS));
  expect(lastSnapshot().lastMeeting.title).toBeNull();
});

it('publishes nothing until the lock setting is known, so a title cannot slip out first', async () => {
  act(() => useAppLockStore.setState({ status: 'hydrating', enabled: false }));
  mount(<Probe />);
  act(() => jest.advanceTimersByTime(WIDGET_SYNC_DEBOUNCE_MS * 5));
  expect(publish).not.toHaveBeenCalled();
  act(() => useAppLockStore.setState({ status: 'ready', enabled: true }));
  act(() => jest.advanceTimersByTime(WIDGET_SYNC_DEBOUNCE_MS));
  expect(publish).toHaveBeenCalledTimes(1);
  expect(lastSnapshot().lastMeeting.title).toBeNull();
});

it('collapses a burst of changes into one publish', () => {
  mount(<Probe />);
  act(() => useRecordingStore.setState({ phase: 'recording' }));
  act(() => useRecordingStore.setState({ phase: 'ending' }));
  act(() => jest.advanceTimersByTime(WIDGET_SYNC_DEBOUNCE_MS));
  expect(publish).toHaveBeenCalledTimes(1);
});

it('signed-out half publishes the signed-out snapshot when the session ends', () => {
  act(() => useSessionStore.setState({ authStatus: 'authenticated' }));
  mount(<SignedOutProbe />);
  expect(publish).not.toHaveBeenCalled();
  act(() => useSessionStore.setState({ authStatus: 'unauthenticated' }));
  expect(publish).toHaveBeenCalledWith(SIGNED_OUT_SNAPSHOT);
});
