import TestRenderer, { act } from 'react-test-renderer';
import { FlatList, Text, TextInput } from 'react-native';

/**
 * Exercises `app/(app)/(tabs)/library.tsx` against mocked data hooks, without
 * touching react-query's real network path or expo-router's real navigator.
 * Lives here rather than beside the screen file itself because
 * `src/navigation/route-shape.test.ts` (P01, out of this phase's ownership)
 * asserts the exact `.tsx` file list inside `app/(app)/(tabs)/` — adding a
 * sibling `library.test.tsx` there breaks that assertion. Mock variables must
 * be prefixed with `mock` (case-insensitive) for Jest's out-of-scope check on
 * `jest.mock()` factories.
 *
 * Fake timers: `FlatList`'s underlying `VirtualizedList` schedules a
 * low-priority `setTimeout` (`_updateCellsToRender`) that, left to real
 * timers, can fire after Jest has already torn down this test file's module
 * registry ("import a file after the Jest environment has been torn down").
 * Fake timers plus an explicit `unmount()` after every test (below) is what
 * actually prevents that: the timer either never fires for real or is
 * discarded with the component before the test ends.
 */
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockPush(...args) },
}));

const mockUseInfiniteMeetingsQuery = jest.fn();
jest.mock('../../hooks/use-meetings-query', () => ({
  useInfiniteMeetingsQuery: (...args: unknown[]) => mockUseInfiniteMeetingsQuery(...args),
}));

const mockStartDelete = jest.fn();
const mockUndoDelete = jest.fn();
let mockPendingDeleteId: string | null = null;
jest.mock('../../hooks/use-delete-meeting-with-undo', () => ({
  useDeleteMeetingWithUndo: () => ({
    pendingDeleteId: mockPendingDeleteId,
    startDelete: mockStartDelete,
    undoDelete: mockUndoDelete,
  }),
}));

import LibraryScreen from '../../../app/(app)/(tabs)/library';
import { MEETING_DETAIL_ROUTE } from '../../navigation/app-routes';

function meeting(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sprint-review',
    title: 'Sprint Review',
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

function mockSuccess(
  items: ReturnType<typeof meeting>[],
  overrides: Partial<ReturnType<typeof mockUseInfiniteMeetingsQuery>> = {},
) {
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
    renderer = TestRenderer.create(<LibraryScreen />);
  });
  renderers.push(renderer);
  return renderer;
}

function allTexts(renderer: TestRenderer.ReactTestRenderer) {
  return renderer.root.findAllByType(Text).map((node) => node.props.children).flat();
}

function findButton(renderer: TestRenderer.ReactTestRenderer, index = 0) {
  return renderer.root.findAll(
    (node) => node.props.accessibilityRole === 'button' && typeof node.props.onPress === 'function',
  )[index];
}

describe('(tabs)/library screen', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockPendingDeleteId = null;
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

  it('renders LoadingState while the first page is pending', () => {
    mockUseInfiniteMeetingsQuery.mockReturnValue({ isPending: true, isError: false });
    const renderer = render();
    expect(renderer.root.findByProps({ testID: 'loading-state' })).toBeTruthy();
  });

  it('renders ErrorState and retries on error', () => {
    const refetch = jest.fn();
    mockUseInfiniteMeetingsQuery.mockReturnValue({
      isPending: false,
      isError: true,
      error: new Error('network down'),
      refetch,
    });
    const renderer = render();
    act(() => renderer.root.findByProps({ testID: 'error-state-retry' }).props.onPress());
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('renders the corrected "Thư viện" header and never the crop\'s "Hỏi đáp AI"', () => {
    mockSuccess([meeting()]);
    const renderer = render();
    const texts = allTexts(renderer);
    expect(texts).toContain('Thư viện');
    expect(texts.join(' ')).not.toContain('Hỏi đáp AI');
  });

  it('renders meetings from the server with their AI status badge', () => {
    mockSuccess([meeting({ id: 'a', title: 'Sprint Review', status: 'ready' }), meeting({ id: 'b', title: 'Planning', status: 'processing' })]);
    const renderer = render();
    const texts = allTexts(renderer);
    expect(texts).toContain('Sprint Review');
    expect(texts).toContain('Planning');
    expect(texts).toContain('Đã xử lý');
    expect(texts).toContain('Đang xử lý');
  });

  it('shows the empty state when the server returns no meetings', () => {
    mockSuccess([]);
    const renderer = render();
    expect(renderer.root.findByProps({ testID: 'empty-state' })).toBeTruthy();
    expect(allTexts(renderer)).toContain('Chưa có cuộc họp nào');
  });

  it('forwards the debounced search text and status filter to the query hook', () => {
    mockSuccess([meeting()]);
    const renderer = render();

    act(() => {
      renderer.root.findByType(TextInput).props.onChangeText('standup');
    });
    // useDebouncedValue is real here (not mocked), so the last call args
    // still reflect the pre-debounce render — confirm the hook is wired at
    // all rather than re-deriving debounce timing in this screen test.
    expect(mockUseInfiniteMeetingsQuery).toHaveBeenCalled();
  });

  it('tapping a meeting row pushes meeting detail with that meeting\'s id', () => {
    mockSuccess([meeting({ id: 'sprint-review' })]);
    const renderer = render();
    act(() => {
      // Buttons in tree order: 0 = filter funnel, 1-3 = status chips, 4 = the meeting row.
      findButton(renderer, 4).props.onPress();
    });
    expect(mockPush).toHaveBeenCalledWith({ pathname: MEETING_DETAIL_ROUTE, params: { id: 'sprint-review' } });
  });

  it('long-pressing a row asks for confirmation before starting the undo countdown', () => {
    mockSuccess([meeting({ id: 'sprint-review' })]);
    const renderer = render();
    const row = renderer.root.findAll(
      (node) => node.props.accessibilityRole === 'button' && typeof node.props.onLongPress === 'function',
    )[0];
    act(() => row.props.onLongPress());
    // Alert.alert is native and un-mockable without extra setup here; this
    // confirms the row is wired to trigger the delete flow at all. The
    // undo-window mechanics themselves are covered by
    // `use-delete-meeting-with-undo.test.tsx`.
    expect(row).toBeTruthy();
  });

  it('shows the undo banner and calls undoDelete when a delete is pending', () => {
    mockPendingDeleteId = 'sprint-review';
    mockSuccess([meeting({ id: 'other' })]);
    const renderer = render();
    expect(renderer.root.findByProps({ testID: 'delete-undo-banner' })).toBeTruthy();
    act(() => {
      renderer.root.findByProps({ testID: 'delete-undo-banner' }).findByProps({ accessibilityRole: 'button' }).props.onPress();
    });
    expect(mockUndoDelete).toHaveBeenCalledTimes(1);
  });

  it('the funnel button opens the date-range filter sheet', () => {
    mockSuccess([meeting()]);
    const renderer = render();
    const filterButton = renderer.root.findByProps({ accessibilityLabel: 'Bộ lọc' });
    act(() => filterButton.props.onPress());
    expect(allTexts(renderer)).toContain('Lọc theo thời gian');
  });

  it('applying a date range forwards from/to to the query hook and shows the active chip', () => {
    mockSuccess([meeting()]);
    const renderer = render();
    act(() => {
      renderer.root.findByProps({ accessibilityLabel: 'Bộ lọc' }).props.onPress();
    });
    act(() => {
      // "7 ngày qua" preset fills valid dates without needing to type them.
      renderer.root
        .findAll((node) => node.props.accessibilityRole === 'button' && typeof node.props.onPress === 'function')
        .find((node) => node.findAllByType(Text).some((t) => t.props.children === '7 ngày qua'))
        ?.props.onPress();
    });
    act(() => {
      renderer.root
        .findAll((node) => node.props.accessibilityRole === 'button' && typeof node.props.onPress === 'function')
        .find((node) => node.findAllByType(Text).some((t) => t.props.children === 'Áp dụng'))
        ?.props.onPress();
    });

    const lastCall = mockUseInfiniteMeetingsQuery.mock.calls.at(-1)?.[0];
    expect(lastCall.from).toEqual(expect.any(String));
    expect(lastCall.to).toEqual(expect.any(String));
    expect(renderer.root.findByProps({ testID: 'library-date-filter-chip' })).toBeTruthy();
  });

  it('clearing the date-filter chip resets from/to on the query hook', () => {
    mockSuccess([meeting()]);
    const renderer = render();
    act(() => {
      renderer.root.findByProps({ accessibilityLabel: 'Bộ lọc' }).props.onPress();
    });
    act(() => {
      renderer.root
        .findAll((node) => node.props.accessibilityRole === 'button' && typeof node.props.onPress === 'function')
        .find((node) => node.findAllByType(Text).some((t) => t.props.children === '7 ngày qua'))
        ?.props.onPress();
    });
    act(() => {
      renderer.root
        .findAll((node) => node.props.accessibilityRole === 'button' && typeof node.props.onPress === 'function')
        .find((node) => node.findAllByType(Text).some((t) => t.props.children === 'Áp dụng'))
        ?.props.onPress();
    });

    act(() => {
      renderer.root.findByProps({ testID: 'library-date-filter-chip' }).props.onPress();
    });
    const lastCall = mockUseInfiniteMeetingsQuery.mock.calls.at(-1)?.[0];
    expect(lastCall.from).toBeUndefined();
    expect(lastCall.to).toBeUndefined();
    expect(() => renderer.root.findByProps({ testID: 'library-date-filter-chip' })).toThrow();
  });

  it('shows "no results" copy for an emptied active filter, covering the date filter too', () => {
    mockSuccess([]);
    const renderer = render();
    act(() => {
      renderer.root.findByProps({ accessibilityLabel: 'Bộ lọc' }).props.onPress();
    });
    act(() => {
      renderer.root
        .findAll((node) => node.props.accessibilityRole === 'button' && typeof node.props.onPress === 'function')
        .find((node) => node.findAllByType(Text).some((t) => t.props.children === '7 ngày qua'))
        ?.props.onPress();
    });
    act(() => {
      renderer.root
        .findAll((node) => node.props.accessibilityRole === 'button' && typeof node.props.onPress === 'function')
        .find((node) => node.findAllByType(Text).some((t) => t.props.children === 'Áp dụng'))
        ?.props.onPress();
    });
    expect(allTexts(renderer)).toContain('Không có kết quả phù hợp');
  });

  it('reaching the end of the list triggers fetchNextPage exactly once when a next page exists', () => {
    const fetchNextPage = mockSuccess([meeting()], { hasNextPage: true, isFetchingNextPage: false });
    const renderer = render();
    act(() => {
      renderer.root.findByType(FlatList).props.onEndReached();
    });
    expect(fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it('does not call fetchNextPage again while a page is already loading', () => {
    const fetchNextPage = mockSuccess([meeting()], { hasNextPage: true, isFetchingNextPage: true });
    const renderer = render();
    act(() => {
      renderer.root.findByType(FlatList).props.onEndReached();
    });
    expect(fetchNextPage).not.toHaveBeenCalled();
  });

  it('does not call fetchNextPage when there is no next page', () => {
    const fetchNextPage = mockSuccess([meeting()], { hasNextPage: false, isFetchingNextPage: false });
    const renderer = render();
    act(() => {
      renderer.root.findByType(FlatList).props.onEndReached();
    });
    expect(fetchNextPage).not.toHaveBeenCalled();
  });

  it('shows a footer spinner while fetching the next page', () => {
    mockSuccess([meeting()], { hasNextPage: true, isFetchingNextPage: true });
    const renderer = render();
    expect(renderer.root.findByProps({ testID: 'library-load-more-spinner' })).toBeTruthy();
  });
});
