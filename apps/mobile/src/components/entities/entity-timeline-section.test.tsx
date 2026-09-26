import TestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { EntityTimelineSection } from './entity-timeline-section';

const mockUseEntityTimelineQuery = jest.fn();
jest.mock('../../hooks/use-entity-timeline-query', () => ({
  useEntityTimelineQuery: (...args: unknown[]) => mockUseEntityTimelineQuery(...args),
}));

function item(overrides: Record<string, unknown> = {}) {
  return {
    meeting_id: 'm1',
    meeting_title: 'Sprint Review',
    meeting_date: '2026-01-15T09:00:00.000Z',
    chunk_id: 'c1',
    segment_seq: 12,
    surface_form: 'Anh',
    excerpt: '...Anh phụ trách API...',
    ...overrides,
  };
}

function render(onItemPress = jest.fn()) {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<EntityTimelineSection entityId="e1" onItemPress={onItemPress} />);
  });
  return renderer;
}

function allTexts(renderer: TestRenderer.ReactTestRenderer) {
  return renderer.root.findAllByType(Text).map((t) => t.props.children).flat();
}

describe('EntityTimelineSection', () => {
  beforeEach(() => jest.clearAllMocks());

  it('shows a loading state while pending', () => {
    mockUseEntityTimelineQuery.mockReturnValue({ isPending: true, isError: false, data: undefined, hasNextPage: false });
    const renderer = render();
    expect(renderer.root.findByProps({ testID: 'loading-state' })).toBeTruthy();
  });

  it('shows an error state with retry', () => {
    const refetch = jest.fn();
    mockUseEntityTimelineQuery.mockReturnValue({
      isPending: false,
      isError: true,
      error: new Error('x'),
      data: undefined,
      hasNextPage: false,
      refetch,
    });
    const renderer = render();
    act(() => renderer.root.findByProps({ testID: 'error-state-retry' }).props.onPress());
    expect(refetch).toHaveBeenCalled();
  });

  it('shows an empty message when there are no timeline items', () => {
    mockUseEntityTimelineQuery.mockReturnValue({
      isPending: false,
      isError: false,
      data: { pages: [{ items: [] }] },
      hasNextPage: false,
    });
    const renderer = render();
    expect(allTexts(renderer)).toContain('Chưa có mốc thời gian nào.');
  });

  it('renders each timeline item with its meeting title and excerpt', () => {
    mockUseEntityTimelineQuery.mockReturnValue({
      isPending: false,
      isError: false,
      data: { pages: [{ items: [item()] }] },
      hasNextPage: false,
    });
    const renderer = render();
    const texts = allTexts(renderer);
    expect(texts).toContain('Sprint Review');
    expect(texts).toContain('...Anh phụ trách API...');
  });

  it('tapping an item calls onItemPress with meeting id and segment_seq', () => {
    const onItemPress = jest.fn();
    mockUseEntityTimelineQuery.mockReturnValue({
      isPending: false,
      isError: false,
      data: { pages: [{ items: [item()] }] },
      hasNextPage: false,
    });
    const renderer = render(onItemPress);
    act(() => {
      renderer.root.findByProps({ accessibilityRole: 'button' }).props.onPress();
    });
    expect(onItemPress).toHaveBeenCalledWith('m1', 12);
  });

  it('shows a "Tải thêm" control and calls fetchNextPage', () => {
    const fetchNextPage = jest.fn();
    mockUseEntityTimelineQuery.mockReturnValue({
      isPending: false,
      isError: false,
      data: { pages: [{ items: [item()] }] },
      hasNextPage: true,
      isFetchingNextPage: false,
      fetchNextPage,
    });
    const renderer = render();
    act(() => {
      renderer.root.findByProps({ testID: 'timeline-load-more' }).props.onPress();
    });
    expect(fetchNextPage).toHaveBeenCalled();
  });
});
