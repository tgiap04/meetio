import TestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';

/**
 * `app/(app)/recording-done.tsx` (screen 07) — lives in `src/` because every file under `app/`
 * becomes a route (see src/navigation/app-group-layout.test.tsx).
 */
const mockReplace = jest.fn();
let mockParams: { id?: string } = { id: 'm-1' };
jest.mock('expo-router', () => ({
  router: { replace: (...args: unknown[]) => mockReplace(...args) },
  useLocalSearchParams: () => mockParams,
}));

const mockUseMeetingQuery = jest.fn();
jest.mock('../../hooks/use-meeting-detail-query', () => ({ useMeetingQuery: (id: string) => mockUseMeetingQuery(id) }));
const mockRoomSocket = jest.fn();
jest.mock('../../hooks/use-meeting-room-socket', () => ({ useMeetingRoomSocket: (id: string) => mockRoomSocket(id) }));
const mockReindex = jest.fn();
jest.mock('../../hooks/use-meeting-mutations', () => ({
  useReindexMeetingMutation: () => ({ mutate: mockReindex, isPending: false }),
}));

import RecordingDoneScreen from '../../../app/(app)/recording-done';
import { MeetingProcessingStatus } from '../meeting-detail/meeting-processing-status';
import { MEETING_DETAIL_ROUTE } from '../../navigation/app-routes';
import { APP_HOME_ROUTE } from '../../navigation/route-guards';

const MEETING = {
  id: 'm-1',
  status: 'processing',
  duration_sec: 2538,
  failure_reason: null,
  processing_steps: [{ step: 'chunk', status: 'succeeded' }],
};

function render() {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<RecordingDoneScreen />);
  });
  return renderer;
}
const texts = (r: TestRenderer.ReactTestRenderer) => r.root.findAllByType(Text).map((t) => [t.props.children].flat().join(''));

describe('(app)/recording-done screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = { id: 'm-1' };
    mockUseMeetingQuery.mockReturnValue({ data: MEETING });
  });

  it('shows the real recorded duration and the live pipeline status of THIS meeting', () => {
    const r = render();
    expect(mockUseMeetingQuery).toHaveBeenCalledWith('m-1');
    expect(mockRoomSocket).toHaveBeenCalledWith('m-1'); // progress arrives over the room socket
    expect(texts(r)).toContain('42 phút 18 giây');
    const status = r.root.findByType(MeetingProcessingStatus);
    expect(status.props).toMatchObject({ status: 'processing', processingSteps: MEETING.processing_steps });
  });

  it('retrying a failed pipeline resumes it from the failed step', () => {
    mockUseMeetingQuery.mockReturnValue({ data: { ...MEETING, status: 'failed', failure_reason: 'x' } });
    const r = render();
    act(() => r.root.findByType(MeetingProcessingStatus).props.onRetry());
    expect(mockReindex).toHaveBeenCalledWith({ scope: 'changed' });
  });

  it('"Xem cuộc họp" opens screen 08 for this meeting right away — no waiting for the AI (US-16)', () => {
    const r = render();
    act(() => r.root.findByProps({ label: 'Xem cuộc họp' }).props.onPress());
    expect(mockReplace).toHaveBeenCalledWith({ pathname: MEETING_DETAIL_ROUTE, params: { id: 'm-1' } });
  });

  it('back goes Home — the recording behind this screen has ended', () => {
    const r = render();
    act(() => r.root.findByProps({ accessibilityLabel: 'Quay lại' }).props.onPress());
    expect(mockReplace).toHaveBeenCalledWith(APP_HOME_ROUTE);
  });

  it('shows no duration until the meeting has loaded', () => {
    mockUseMeetingQuery.mockReturnValue({ data: undefined });
    const r = render();
    expect(texts(r).some((t) => t.includes('phút'))).toBe(false);
    expect(r.root.findAllByType(MeetingProcessingStatus)).toHaveLength(0);
  });
});
