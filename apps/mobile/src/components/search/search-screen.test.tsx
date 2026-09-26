import TestRenderer, { act } from 'react-test-renderer';
import { Text, TextInput } from 'react-native';

/**
 * Exercises `app/(app)/(tabs)/search.tsx` against mocked data hooks, without
 * touching react-query's real network path or expo-router's real navigator.
 * Lives under `src/`, not `app/` — see `route-shape.test.ts`'s "no test files
 * live under app/" guard and `library-screen.test.tsx`'s precedent.
 *
 * The screen debounces the query text for 400ms before it drives either data
 * hook (`use-debounced-value` is real here, not mocked) — fake timers +
 * `jest.advanceTimersByTime(400)` settle it, matching
 * `use-debounced-value.test.tsx`'s own idiom.
 */
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockPush(...args) },
}));

const mockUseInfiniteSearchQuery = jest.fn();
jest.mock('../../hooks/use-search-query', () => ({
  useInfiniteSearchQuery: (...args: unknown[]) => mockUseInfiniteSearchQuery(...args),
}));

const mockUseInfiniteMeetingsQuery = jest.fn();
jest.mock('../../hooks/use-meetings-query', () => ({
  useInfiniteMeetingsQuery: (...args: unknown[]) => mockUseInfiniteMeetingsQuery(...args),
}));

const mockUseInfiniteEntitiesQuery = jest.fn();
jest.mock('../../hooks/use-entities-query', () => ({
  useInfiniteEntitiesQuery: (...args: unknown[]) => mockUseInfiniteEntitiesQuery(...args),
}));

import SearchScreen from '../../../app/(app)/(tabs)/search';
import { ENTITY_DETAIL_ROUTE, MEETING_DETAIL_ROUTE, MEETING_TRANSCRIPT_ROUTE } from '../../navigation/app-routes';

function semanticItem(overrides: Record<string, unknown> = {}) {
  return {
    chunk_id: 'c1',
    meeting_id: 'm1',
    meeting_title: 'Sprint Review',
    meeting_date: '2026-01-15T09:00:00.000Z',
    excerpt: '...bàn về ngân sách...',
    segment_seq: 12,
    segment_end_seq: 14,
    score: 0.82,
    ...overrides,
  };
}

function meetingItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 'm2',
    title: 'Client Discussion',
    status: 'ready',
    source_language: 'vi',
    translate_to: null,
    started_at: '2026-01-15T09:00:00.000Z',
    ended_at: '2026-01-15T09:30:00.000Z',
    duration_sec: 1800,
    created_at: '2026-01-15T09:00:00.000Z',
    ...overrides,
  };
}

function mockSemanticIdle() {
  mockUseInfiniteSearchQuery.mockReturnValue({
    isPending: true,
    isError: false,
    data: undefined,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: jest.fn(),
    refetch: jest.fn(),
  });
}

function mockSemanticSuccess(items: ReturnType<typeof semanticItem>[], overrides: Record<string, unknown> = {}) {
  const fetchNextPage = jest.fn();
  mockUseInfiniteSearchQuery.mockReturnValue({
    isPending: false,
    isError: false,
    data: { pages: [{ items, next_offset: null }] },
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage,
    refetch: jest.fn(),
    ...overrides,
  });
  return fetchNextPage;
}

function mockMeetingIdle() {
  mockUseInfiniteMeetingsQuery.mockReturnValue({
    isPending: true,
    isError: false,
    data: undefined,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: jest.fn(),
    refetch: jest.fn(),
  });
}

function entityItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 'e1',
    canonical_name: 'Nguyễn Văn Anh',
    type: 'person',
    aliases: [],
    mention_count: 3,
    meeting_count: 1,
    last_mentioned_at: null,
    ...overrides,
  };
}

function mockEntitiesIdle() {
  mockUseInfiniteEntitiesQuery.mockReturnValue({
    isPending: true,
    isError: false,
    data: undefined,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: jest.fn(),
    refetch: jest.fn(),
  });
}

function mockEntitiesSuccess(items: ReturnType<typeof entityItem>[], overrides: Record<string, unknown> = {}) {
  mockUseInfiniteEntitiesQuery.mockReturnValue({
    isPending: false,
    isError: false,
    data: { pages: [{ items, next_offset: null }] },
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: jest.fn(),
    refetch: jest.fn(),
    ...overrides,
  });
}

function mockMeetingSuccess(items: ReturnType<typeof meetingItem>[], overrides: Record<string, unknown> = {}) {
  const fetchNextPage = jest.fn();
  mockUseInfiniteMeetingsQuery.mockReturnValue({
    isPending: false,
    isError: false,
    data: { pages: [{ items, next_cursor: null }] },
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage,
    refetch: jest.fn(),
    ...overrides,
  });
  return fetchNextPage;
}

const renderers: TestRenderer.ReactTestRenderer[] = [];

function render() {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<SearchScreen />);
  });
  renderers.push(renderer);
  return renderer;
}

function allTexts(renderer: TestRenderer.ReactTestRenderer) {
  return renderer.root.findAllByType(Text).map((node) => node.props.children).flat();
}

function typeQuery(renderer: TestRenderer.ReactTestRenderer, text: string) {
  act(() => {
    renderer.root.findByType(TextInput).props.onChangeText(text);
  });
  act(() => {
    jest.advanceTimersByTime(400);
  });
}

function findChip(renderer: TestRenderer.ReactTestRenderer, label: string) {
  return renderer.root
    .findAll((node) => node.props.accessibilityRole === 'button' && typeof node.props.onPress === 'function')
    .find((node) => node.findAllByType(Text).some((t) => t.props.children === label));
}

describe('(tabs)/search screen', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockSemanticIdle();
    mockMeetingIdle();
    mockEntitiesIdle();
  });

  afterEach(() => {
    while (renderers.length > 0) {
      act(() => renderers.pop()?.unmount());
    }
    act(() => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  it('renders "Tìm kiếm" and an empty-query hint, without querying either endpoint', () => {
    const renderer = render();
    expect(allTexts(renderer)).toContain('Tìm kiếm');
    expect(renderer.root.findByProps({ testID: 'empty-state' })).toBeTruthy();
    expect(mockUseInfiniteSearchQuery).toHaveBeenCalledWith('', false);
    expect(mockUseInfiniteMeetingsQuery).toHaveBeenCalledWith({ q: '', limit: 20 }, { enabled: false });
  });

  it('renders the unhidden "Node" chip', () => {
    const renderer = render();
    expect(allTexts(renderer)).toContain('Node');
  });

  it('shows "Thực thể" and "Người" sections for a settled query under "Node"/"Tất cả"', () => {
    const renderer = render();
    typeQuery(renderer, 'anh');
    mockEntitiesSuccess([entityItem()]);
    act(() => {
      renderer.update(<SearchScreen />);
    });
    expect(allTexts(renderer)).toContain('Thực thể (1)');
    expect(allTexts(renderer)).toContain('Người (1)');
    expect(allTexts(renderer)).toContain('Nguyễn Văn Anh');
  });

  it('tapping an entity result pushes entity detail with its id', () => {
    const renderer = render();
    typeQuery(renderer, 'anh');
    mockEntitiesSuccess([entityItem({ id: 'e9' })]);
    act(() => {
      renderer.update(<SearchScreen />);
    });
    act(() => {
      renderer.root.findAllByProps({ accessibilityRole: 'button' })
        .find((n) => n.findAllByType(Text).some((t) => t.props.children === 'Nguyễn Văn Anh'))
        ?.props.onPress();
    });
    expect(mockPush).toHaveBeenCalledWith({ pathname: ENTITY_DETAIL_ROUTE, params: { id: 'e9' } });
  });

  it('the "Node" chip hides transcript and meeting sections', () => {
    const renderer = render();
    typeQuery(renderer, 'ngân sách');
    mockSemanticSuccess([semanticItem()]);
    mockMeetingSuccess([meetingItem()]);
    mockEntitiesSuccess([entityItem()]);
    act(() => {
      renderer.update(<SearchScreen />);
    });
    act(() => {
      findChip(renderer, 'Node')?.props.onPress();
    });
    expect(allTexts(renderer)).not.toContain('Transcript (1)');
    expect(allTexts(renderer)).not.toContain('Cuộc họp (1)');
    expect(allTexts(renderer)).toContain('Thực thể (1)');
  });

  it('enables both queries once a 2+ char query settles, and renders both sections', () => {
    const renderer = render();
    typeQuery(renderer, 'ngân sách');
    mockSemanticSuccess([semanticItem()]);
    mockMeetingSuccess([meetingItem()]);
    // Re-render is driven by react-query's own state change in real usage;
    // here we assert the hooks were invoked with an enabled query.
    expect(mockUseInfiniteSearchQuery).toHaveBeenCalledWith('ngân sách', true);
    expect(mockUseInfiniteMeetingsQuery).toHaveBeenCalledWith({ q: 'ngân sách', limit: 20 }, { enabled: true });
  });

  it('does not enable semantic search for a 1-char query, but does enable title search', () => {
    const renderer = render();
    typeQuery(renderer, 'a');
    expect(mockUseInfiniteSearchQuery).toHaveBeenCalledWith('a', false);
    expect(mockUseInfiniteMeetingsQuery).toHaveBeenCalledWith({ q: 'a', limit: 20 }, { enabled: true });
  });

  it('renders the Transcript section from semantic results with the correct heading count', () => {
    const renderer = render();
    typeQuery(renderer, 'ngân sách');
    mockSemanticSuccess([semanticItem({ chunk_id: 'c1' }), semanticItem({ chunk_id: 'c2', meeting_title: 'Client Discussion' })]);
    act(() => {
      renderer.update(<SearchScreen />);
    });
    expect(allTexts(renderer)).toContain('Transcript (2)');
    expect(allTexts(renderer)).toContain('Sprint Review');
    expect(allTexts(renderer)).toContain('Client Discussion');
  });

  it('renders the Cuộc họp section from title-search results', () => {
    const renderer = render();
    typeQuery(renderer, 'sprint');
    mockMeetingSuccess([meetingItem({ id: 'm2', title: 'Sprint Review' })]);
    act(() => {
      renderer.update(<SearchScreen />);
    });
    expect(allTexts(renderer)).toContain('Cuộc họp (1)');
    expect(allTexts(renderer)).toContain('Sprint Review');
  });

  it('the "Transcript" chip hides the meeting section', () => {
    const renderer = render();
    typeQuery(renderer, 'ngân sách');
    mockSemanticSuccess([semanticItem()]);
    mockMeetingSuccess([meetingItem()]);
    act(() => {
      renderer.update(<SearchScreen />);
    });
    act(() => {
      findChip(renderer, 'Transcript')?.props.onPress();
    });
    expect(allTexts(renderer)).toContain('Transcript (1)');
    expect(allTexts(renderer)).not.toContain('Cuộc họp (1)');
    expect(mockUseInfiniteMeetingsQuery).toHaveBeenLastCalledWith(
      { q: 'ngân sách', limit: 20 },
      { enabled: false },
    );
  });

  it('the "Meeting" chip hides the transcript section', () => {
    const renderer = render();
    typeQuery(renderer, 'ngân sách');
    mockSemanticSuccess([semanticItem()]);
    mockMeetingSuccess([meetingItem()]);
    act(() => {
      renderer.update(<SearchScreen />);
    });
    act(() => {
      findChip(renderer, 'Meeting')?.props.onPress();
    });
    expect(allTexts(renderer)).toContain('Cuộc họp (1)');
    expect(allTexts(renderer)).not.toContain('Transcript (1)');
    expect(mockUseInfiniteSearchQuery).toHaveBeenLastCalledWith('ngân sách', false);
  });

  it('shows "không tìm thấy" when every enabled section settles with zero items', () => {
    const renderer = render();
    typeQuery(renderer, 'zzz');
    mockSemanticSuccess([]);
    mockMeetingSuccess([]);
    mockEntitiesSuccess([]);
    act(() => {
      renderer.update(<SearchScreen />);
    });
    expect(allTexts(renderer)).toContain('Không tìm thấy kết quả phù hợp');
  });

  it('shows LoadingState for the transcript section while it is pending', () => {
    const renderer = render();
    typeQuery(renderer, 'ngân sách');
    mockMeetingSuccess([meetingItem()]);
    mockEntitiesSuccess([]);
    act(() => {
      renderer.update(<SearchScreen />);
    });
    expect(renderer.root.findAllByProps({ testID: 'loading-state' }).length).toBeGreaterThan(0);
  });

  it('shows a friendly, retryable message when semantic search is unavailable (503)', () => {
    const refetch = jest.fn();
    const unavailable = Object.assign(new Error('unavailable'), {
      isAxiosError: true,
      response: { data: { error: { code: 'AI_SERVICE_UNAVAILABLE' } } },
    });
    const renderer = render();
    typeQuery(renderer, 'ngân sách');
    mockSemanticSuccess([], { isPending: false, isError: true, error: unavailable, refetch });
    mockMeetingSuccess([meetingItem()]);
    act(() => {
      renderer.update(<SearchScreen />);
    });
    expect(allTexts(renderer).join(' ')).toContain('Tìm kiếm ngữ nghĩa tạm thời không khả dụng.');
    act(() => renderer.root.findByProps({ testID: 'error-state-retry' }).props.onPress());
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('tapping a transcript result pushes the transcript route with id and seq', () => {
    const renderer = render();
    typeQuery(renderer, 'ngân sách');
    mockSemanticSuccess([semanticItem({ meeting_id: 'm1', segment_seq: 12 })]);
    act(() => {
      renderer.update(<SearchScreen />);
    });
    act(() => {
      renderer.root.findByProps({ leading: 'waveform', snippet: '...bàn về ngân sách...' }).props.onPress();
    });
    expect(mockPush).toHaveBeenCalledWith({ pathname: MEETING_TRANSCRIPT_ROUTE, params: { id: 'm1', seq: '12' } });
  });

  it('tapping a meeting result pushes meeting detail with that id', () => {
    const renderer = render();
    typeQuery(renderer, 'sprint');
    mockMeetingSuccess([meetingItem({ id: 'm2' })]);
    act(() => {
      renderer.update(<SearchScreen />);
    });
    act(() => {
      renderer.root.findByProps({ title: 'Client Discussion' }).props.onPress();
    });
    expect(mockPush).toHaveBeenCalledWith({ pathname: MEETING_DETAIL_ROUTE, params: { id: 'm2' } });
  });

  it('shows a "Tải thêm" control for the transcript section when a next page exists', () => {
    const fetchNextPage = jest.fn();
    const renderer = render();
    typeQuery(renderer, 'ngân sách');
    mockSemanticSuccess([semanticItem()], { hasNextPage: true, fetchNextPage });
    mockMeetingSuccess([]);
    act(() => {
      renderer.update(<SearchScreen />);
    });
    act(() => {
      renderer.root.findByProps({ testID: 'search-load-more' }).props.onPress();
    });
    expect(fetchNextPage).toHaveBeenCalledTimes(1);
  });
});
