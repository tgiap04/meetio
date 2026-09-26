import TestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import EntitiesListScreen from '../../../app/(app)/entities';
import { ENTITY_DETAIL_ROUTE, MERGE_SUGGESTIONS_ROUTE } from '../../navigation/app-routes';

const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockPush(...args), back: (...args: unknown[]) => mockBack(...args) },
}));

const mockUseInfiniteEntitiesQuery = jest.fn();
jest.mock('../../hooks/use-entities-query', () => ({
  useInfiniteEntitiesQuery: (...args: unknown[]) => mockUseInfiniteEntitiesQuery(...args),
}));

const mockUseMergeSuggestionsQuery = jest.fn();
jest.mock('../../hooks/use-merge-suggestions-query', () => ({
  useMergeSuggestionsQuery: (...args: unknown[]) => mockUseMergeSuggestionsQuery(...args),
}));

function entity(overrides: Record<string, unknown> = {}) {
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

function mockEntitiesSuccess(items: ReturnType<typeof entity>[], overrides: Record<string, unknown> = {}) {
  const fetchNextPage = jest.fn();
  mockUseInfiniteEntitiesQuery.mockReturnValue({
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

function render() {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<EntitiesListScreen />);
  });
  return renderer;
}

function allTexts(renderer: TestRenderer.ReactTestRenderer) {
  return renderer.root.findAllByType(Text).map((t) => t.props.children).flat();
}

describe('EntitiesListScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseMergeSuggestionsQuery.mockReturnValue({ data: { items: [] } });
  });

  it('shows a loading state while entities are pending', () => {
    mockUseInfiniteEntitiesQuery.mockReturnValue({ isPending: true, isError: false, data: undefined });
    const renderer = render();
    expect(renderer.root.findByProps({ testID: 'loading-state' })).toBeTruthy();
  });

  it('shows an error state with retry on failure', () => {
    const refetch = jest.fn();
    mockUseInfiniteEntitiesQuery.mockReturnValue({ isPending: false, isError: true, error: new Error('x'), refetch });
    const renderer = render();
    act(() => renderer.root.findByProps({ testID: 'error-state-retry' }).props.onPress());
    expect(refetch).toHaveBeenCalled();
  });

  it('renders every entity row', () => {
    mockEntitiesSuccess([entity({ id: 'e1' }), entity({ id: 'e2', canonical_name: 'Lê Thị Mai' })]);
    const renderer = render();
    expect(allTexts(renderer)).toContain('Nguyễn Văn Anh');
    expect(allTexts(renderer)).toContain('Lê Thị Mai');
  });

  it('tapping an entity row pushes entity detail with its id', () => {
    mockEntitiesSuccess([entity({ id: 'e1' })]);
    const renderer = render();
    const row = renderer.root
      .findAll((n) => n.props.accessibilityRole === 'button' && typeof n.props.onPress === 'function')
      .find((n) => n.findAllByType(Text).some((t) => t.props.children === 'Nguyễn Văn Anh'));
    act(() => {
      row?.props.onPress();
    });
    expect(mockPush).toHaveBeenCalledWith({ pathname: ENTITY_DETAIL_ROUTE, params: { id: 'e1' } });
  });

  it('shows the merge-suggestions entry when suggestions exist, and navigates on tap', () => {
    mockEntitiesSuccess([]);
    mockUseMergeSuggestionsQuery.mockReturnValue({ data: { items: [{ id: 's1' }, { id: 's2' }] } });
    const renderer = render();
    expect(allTexts(renderer).join(' ')).toContain('Xem đề xuất gộp (2)');
    let node = renderer.root.findByProps({ name: 'merge' }).parent;
    while (node && typeof node.props.onPress !== 'function') {
      node = node.parent;
    }
    act(() => node?.props.onPress());
    expect(mockPush).toHaveBeenCalledWith(MERGE_SUGGESTIONS_ROUTE);
  });

  it('shows an empty state when there are no entities', () => {
    mockEntitiesSuccess([]);
    const renderer = render();
    expect(allTexts(renderer)).toContain('Chưa có thực thể nào');
  });
});
