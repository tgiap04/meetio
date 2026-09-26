import TestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { MeetingStatus, ProcessingStep } from '@meetio/shared';
import { MEETING_GRAPH_ROUTE, MEETING_TRANSCRIPT_ROUTE } from '../../navigation/app-routes';

const mockPush = jest.fn();
const mockBack = jest.fn();
let mockSearchParams: { id?: string } = {};

jest.mock('expo-router', () => ({
  router: {
    push: (...args: unknown[]) => mockPush(...args),
    back: (...args: unknown[]) => mockBack(...args),
  },
  useLocalSearchParams: () => mockSearchParams,
}));

const mockUseMeetingQuery = jest.fn();
jest.mock('../../hooks/use-meeting-detail-query', () => ({
  useMeetingQuery: (...args: unknown[]) => mockUseMeetingQuery(...args),
}));

const mockUpdateMutate = jest.fn();
const mockReindexMutate = jest.fn();
jest.mock('../../hooks/use-meeting-mutations', () => ({
  useUpdateMeetingMutation: () => ({ mutate: mockUpdateMutate, isPending: false }),
  useReindexMeetingMutation: () => ({ mutate: mockReindexMutate, isPending: false }),
}));

const mockExportMutate = jest.fn();
jest.mock('../../hooks/use-export-meeting-mutation', () => ({
  useExportMeetingMutation: () => ({ mutate: mockExportMutate, isPending: false }),
}));

const mockUseMeetingRoomSocket = jest.fn();
jest.mock('../../hooks/use-meeting-room-socket', () => ({
  useMeetingRoomSocket: (...args: unknown[]) => mockUseMeetingRoomSocket(...args),
}));

// ActionItemsTab owns its own data (query + mutations) and is unit-tested on
// its own — stubbed here to a simple marker so this suite stays about the
// screen shell (tabs, hero, export, retry), not the tab's internals.
jest.mock('./action-items-tab', () => ({
  ActionItemsTab: ({ meetingId }: { meetingId: string }) => {
    const { Text: RNText } = jest.requireActual('react-native');
    return <RNText>{`ActionItemsTab:${meetingId}`}</RNText>;
  },
}));

import MeetingDetailScreen from '../../../app/(app)/meeting-detail';

function meeting(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sprint-review',
    title: 'Sprint Review',
    status: MeetingStatus.READY,
    source_language: 'vi',
    translate_to: null,
    started_at: '2026-01-15T09:00:00.000Z',
    ended_at: '2026-01-15T09:30:00.000Z',
    duration_sec: 1800,
    created_at: '2026-01-15T09:00:00.000Z',
    audio_source: 'device_mic',
    recording_quality: 'standard',
    summary: 'Đã thảo luận về roadmap quý này.',
    summary_citations: [
      { kind: 'point', text: 'Roadmap quý này đã chốt', chunk_ids: ['c1'], segment_seq: 2 },
    ],
    summary_insufficient: false,
    failure_reason: null,
    segment_count: 42,
    action_items: [],
    processing_steps: [],
    has_unprocessed_edits: false,
    updated_at: '2026-01-15T09:30:00.000Z',
    ...overrides,
  };
}

function mockSuccess(overrides: Record<string, unknown> = {}) {
  mockUseMeetingQuery.mockReturnValue({
    isPending: false,
    isError: false,
    data: meeting(overrides),
    refetch: jest.fn(),
  });
}

function render() {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<MeetingDetailScreen />);
  });
  return renderer;
}

function allText(renderer: TestRenderer.ReactTestRenderer) {
  return renderer.root.findAllByType(Text).map((node) => node.props.children).flat().join('');
}

function pressTab(renderer: TestRenderer.ReactTestRenderer, label: string) {
  const tabs = renderer.root.findAllByProps({ accessibilityRole: 'tab' });
  const tab = tabs.find((node) =>
    node.findAllByType(Text).map((textNode) => textNode.props.children).flat().join('').includes(label),
  );
  if (!tab) {
    throw new Error(`No tab found with label "${label}"`);
  }
  act(() => tab.props.onPress());
}

describe('MeetingDetailScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams = { id: 'sprint-review' };
    // Default so a test that never reaches the meeting query (e.g. missing
    // ?id=) doesn't crash on `meetingQuery.data` before the early return.
    mockUseMeetingQuery.mockReturnValue({ isPending: false, isError: false, data: undefined, refetch: jest.fn() });
  });

  it('shows an error state and does not query when ?id= is missing', () => {
    mockSearchParams = {};
    const renderer = render();
    expect(renderer.root.findByProps({ testID: 'error-state' })).toBeTruthy();
  });

  it('renders LoadingState while the meeting is pending', () => {
    mockUseMeetingQuery.mockReturnValue({ isPending: true, isError: false });
    const renderer = render();
    expect(renderer.root.findByProps({ testID: 'loading-state' })).toBeTruthy();
  });

  it('renders ErrorState and retries on error', () => {
    const refetch = jest.fn();
    mockUseMeetingQuery.mockReturnValue({ isPending: false, isError: true, error: new Error('x'), refetch });
    const renderer = render();
    act(() => renderer.root.findByProps({ testID: 'error-state-retry' }).props.onPress());
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('renders the resolved meeting title and joins the meeting room', () => {
    mockSuccess({ title: 'Client Discussion' });
    const renderer = render();
    expect(renderer.root.findByProps({ accessibilityLabel: 'Tiêu đề cuộc họp' }).props.value).toBe(
      'Client Discussion',
    );
    expect(mockUseMeetingRoomSocket).toHaveBeenCalledWith('sprint-review');
  });

  it('shows the summary under the Tóm tắt tab (and not the Action Items tab content) when ready', () => {
    mockSuccess();
    const renderer = render();
    expect(allText(renderer)).toContain('Tóm tắt nội dung');
    expect(allText(renderer)).not.toContain('ActionItemsTab:sprint-review');
  });

  it('switches to the Action Items tab without navigating', () => {
    mockSuccess();
    const renderer = render();
    pressTab(renderer, 'Action Items');
    expect(mockPush).not.toHaveBeenCalled();
    expect(allText(renderer)).not.toContain('Tóm tắt nội dung');
    expect(allText(renderer)).toContain('ActionItemsTab:sprint-review');
  });

  it('tapping Transcript pushes the transcript route with the resolved id', () => {
    mockSuccess();
    const renderer = render();
    pressTab(renderer, 'Transcript');
    expect(mockPush).toHaveBeenCalledWith({ pathname: MEETING_TRANSCRIPT_ROUTE, params: { id: 'sprint-review' } });
  });

  it('tapping Graph pushes the graph route with the resolved id', () => {
    mockSuccess();
    const renderer = render();
    pressTab(renderer, 'Graph');
    expect(mockPush).toHaveBeenCalledWith({ pathname: MEETING_GRAPH_ROUTE, params: { id: 'sprint-review' } });
  });

  it('hides the summary/action-items content while the meeting is still processing', () => {
    mockSuccess({
      status: MeetingStatus.PROCESSING,
      processing_steps: [
        { step: ProcessingStep.CHUNK, status: 'succeeded', attempts: 1, error_message: null },
        { step: ProcessingStep.EMBED, status: 'running', attempts: 1, error_message: null },
      ],
    });
    const renderer = render();
    expect(allText(renderer)).not.toContain('Tóm tắt nội dung');
    expect(allText(renderer)).not.toContain('ActionItemsTab:sprint-review');
    expect(allText(renderer)).toContain('Đang tạo embedding');
  });

  it('shows the failure reason and retries via reindex(scope: changed) on failure', () => {
    mockSuccess({ status: MeetingStatus.FAILED, failure_reason: 'Hết hạn mức' });
    const renderer = render();
    expect(allText(renderer)).toContain('Hết hạn mức');
    act(() => {
      renderer.root.findByProps({ testID: 'meeting-processing-failed' }).findByProps({ accessibilityRole: 'button' }).props.onPress();
    });
    expect(mockReindexMutate).toHaveBeenCalledWith({ scope: 'changed' });
  });

  it('calls router.back from the header back chevron', () => {
    mockSuccess();
    const renderer = render();
    const backButton = renderer.root.findByProps({ accessibilityLabel: 'Quay lại' });
    act(() => backButton.props.onPress());
    expect(mockBack).toHaveBeenCalled();
  });

  it('opens the export sheet from the kebab (now the export entry point)', () => {
    mockSuccess();
    const renderer = render();
    const kebab = renderer.root.findByProps({ testID: 'meeting-detail-kebab' });
    act(() => kebab.props.onPress());
    expect(renderer.root.findByProps({ visible: true }).type).toBeTruthy();
  });

  it('tapping a summary citation pushes the transcript route with the citation segment_seq', () => {
    mockSuccess();
    const renderer = render();
    act(() => {
      renderer.root.findByProps({ accessibilityLabel: 'Roadmap quý này đã chốt' }).props.onPress();
    });
    expect(mockPush).toHaveBeenCalledWith({
      pathname: MEETING_TRANSCRIPT_ROUTE,
      params: { id: 'sprint-review', seq: '2' },
    });
  });

  it('autosaves the title on blur', () => {
    mockSuccess();
    const renderer = render();
    const titleInput = renderer.root.findByProps({ accessibilityLabel: 'Tiêu đề cuộc họp' });
    act(() => titleInput.props.onChangeText('New title'));
    act(() => titleInput.props.onBlur());
    expect(mockUpdateMutate).toHaveBeenCalledWith({ title: 'New title' });
  });
});
