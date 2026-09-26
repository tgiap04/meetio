import TestRenderer, { act } from 'react-test-renderer';
import { Alert, Text } from 'react-native';
import MeetingChatScreen from '../../app/(app)/meeting-chat';

/**
 * Exercises `app/(app)/meeting-chat.tsx`. Lives here rather than beside the
 * screen file itself because `src/navigation/route-shape.test.ts` asserts no
 * `*.test.tsx` lives anywhere under `app/` — same convention as
 * `actions-screen.test.tsx` next to it.
 */
const mockPush = jest.fn();
const mockBack = jest.fn();
const mockUseLocalSearchParams = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockPush(...args), back: (...args: unknown[]) => mockBack(...args) },
  useLocalSearchParams: () => mockUseLocalSearchParams(),
}));

const mockUseMeetingQaHistoryQuery = jest.fn();
jest.mock('../hooks/use-qa-history-query', () => {
  const actual = jest.requireActual('../hooks/use-qa-history-query');
  return {
    ...actual,
    useMeetingQaHistoryQuery: (...args: unknown[]) => mockUseMeetingQaHistoryQuery(...args),
  };
});

const mockAskMutateAsync = jest.fn();
const mockDeleteMutateAsync = jest.fn();
jest.mock('../hooks/use-qa-mutations', () => ({
  useAskMeetingQuestionMutation: () => ({ mutateAsync: mockAskMutateAsync, isPending: false }),
  useDeleteMeetingQaHistoryMutation: () => ({ mutateAsync: mockDeleteMutateAsync, isPending: false }),
}));

function qaMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: 'm1',
    role: 'user',
    content: 'Ai phụ trách API?',
    citations: [],
    confidence: null,
    not_found: false,
    low_confidence: false,
    filters: null,
    created_at: '2026-05-01T00:00:00.000Z',
    ...overrides,
  };
}

function mockHistorySuccess(items: ReturnType<typeof qaMessage>[], overrides: Record<string, unknown> = {}) {
  const refetch = jest.fn();
  const fetchNextPage = jest.fn();
  mockUseMeetingQaHistoryQuery.mockReturnValue({
    isPending: false,
    isError: false,
    data: { pages: [{ items, next_before: null }] },
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage,
    refetch,
    ...overrides,
  });
  return { refetch, fetchNextPage };
}

let activeRenderer: TestRenderer.ReactTestRenderer | undefined;

function render() {
  act(() => {
    activeRenderer = TestRenderer.create(<MeetingChatScreen />);
  });
  return activeRenderer!;
}

function allTexts(renderer: TestRenderer.ReactTestRenderer) {
  return renderer.root.findAllByType(Text).map((node) => node.props.children).flat();
}

describe('MeetingChatScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseLocalSearchParams.mockReturnValue({ id: 'meeting-1' });
  });

  afterEach(() => {
    act(() => activeRenderer?.unmount());
    activeRenderer = undefined;
  });

  it('shows an error state with no meeting id', () => {
    mockUseLocalSearchParams.mockReturnValue({});
    mockHistorySuccess([]);
    const renderer = render();
    expect(renderer.root.findByProps({ testID: 'error-state' })).toBeTruthy();
  });

  it('shows a loading state while history is pending', () => {
    mockUseMeetingQaHistoryQuery.mockReturnValue({ isPending: true, isError: false, data: undefined });
    const renderer = render();
    expect(renderer.root.findByProps({ testID: 'loading-state' })).toBeTruthy();
  });

  it('renders the loaded history', () => {
    mockHistorySuccess([qaMessage({ id: 'q1', content: 'Ai phụ trách API?' })]);
    const renderer = render();
    expect(allTexts(renderer)).toContain('Ai phụ trách API?');
  });

  it('sending a question shows an optimistic bubble, then the confirmed answer', async () => {
    mockHistorySuccess([]);
    mockAskMutateAsync.mockResolvedValue({
      question: qaMessage({ id: 'q1', content: 'Ai phụ trách API?' }),
      answer: qaMessage({ id: 'a1', role: 'assistant', content: 'Bình phụ trách API.' }),
    });
    const renderer = render();

    act(() => {
      renderer.root.findByProps({ testID: 'qa-composer-input' }).props.onChangeText('Ai phụ trách API?');
    });
    act(() => {
      renderer.root.findByProps({ testID: 'qa-composer-send' }).props.onPress();
    });

    expect(mockAskMutateAsync).toHaveBeenCalledWith({ question: 'Ai phụ trách API?' });
    expect(allTexts(renderer)).toContain('Ai phụ trách API?');

    await act(async () => {
      await Promise.resolve();
    });

    expect(allTexts(renderer)).toContain('Bình phụ trách API.');
  });

  it('a MEETING_NOT_READY failure replaces the composer with the not-ready notice', async () => {
    mockHistorySuccess([]);
    const error = { isAxiosError: true, response: { data: { error: { code: 'MEETING_NOT_READY' } } } };
    mockAskMutateAsync.mockRejectedValue(error);
    const renderer = render();

    act(() => {
      renderer.root.findByProps({ testID: 'qa-composer-input' }).props.onChangeText('x');
    });
    act(() => {
      renderer.root.findByProps({ testID: 'qa-composer-send' }).props.onPress();
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(renderer.root.findByProps({ testID: 'qa-not-ready-notice' })).toBeTruthy();
    expect(renderer.root.findAllByProps({ testID: 'qa-composer-input' })).toHaveLength(0);
  });

  it('tapping "Xóa lịch sử" confirms before deleting', () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockHistorySuccess([]);
    const renderer = render();
    act(() => renderer.root.findByProps({ testID: 'meeting-chat-delete-history' }).props.onPress());
    expect(alertSpy).toHaveBeenCalledWith('Xóa lịch sử', expect.any(String), expect.any(Array));
    alertSpy.mockRestore();
  });
});
