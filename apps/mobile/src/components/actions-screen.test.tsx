import TestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import ActionsScreen from '../../app/(app)/actions';
import { MEETING_DETAIL_ROUTE } from '../navigation/app-routes';

const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockPush(...args), back: (...args: unknown[]) => mockBack(...args) },
}));

const mockUseInfiniteActionsListQuery = jest.fn();
jest.mock('../hooks/use-actions-list-query', () => ({
  useInfiniteActionsListQuery: (...args: unknown[]) => mockUseInfiniteActionsListQuery(...args),
}));

const mockUseActionFiltersQuery = jest.fn();
jest.mock('../hooks/use-action-filters-query', () => ({
  useActionFiltersQuery: (...args: unknown[]) => mockUseActionFiltersQuery(...args),
}));

const mockUpdateMutate = jest.fn();
jest.mock('../hooks/use-action-mutations', () => ({
  useUpdateActionItemMutation: () => ({ mutate: mockUpdateMutate, isPending: false }),
}));

function actionItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 'a1',
    meeting_id: 'm1',
    meeting_title: 'Sprint Review',
    meeting_date: '15/05/2026',
    content: 'Hoàn thiện API docs',
    assignee_entity_id: null,
    assignee_name: 'Bình',
    due_date: null,
    status: 'open',
    is_manual: false,
    source_chunk_id: null,
    segment_seq: null,
    created_at: '2026-05-01T00:00:00.000Z',
    ...overrides,
  };
}

function mockActionsSuccess(items: ReturnType<typeof actionItem>[], overrides: Record<string, unknown> = {}) {
  const fetchNextPage = jest.fn();
  mockUseInfiniteActionsListQuery.mockReturnValue({
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
    renderer = TestRenderer.create(<ActionsScreen />);
  });
  return renderer;
}

function allTexts(renderer: TestRenderer.ReactTestRenderer) {
  return renderer.root.findAllByType(Text).map((node) => node.props.children).flat();
}

describe('ActionsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseActionFiltersQuery.mockReturnValue({
      data: {
        open_total: 4,
        assignees: [{ id: 'e1', canonical_name: 'Bình', open_count: 1 }],
        meetings: [{ id: 'm1', title: 'Sprint Review', started_at: null, open_count: 2 }],
      },
    });
  });

  it('shows a loading state while actions are pending', () => {
    mockUseInfiniteActionsListQuery.mockReturnValue({ isPending: true, isError: false, data: undefined });
    const renderer = render();
    expect(renderer.root.findByProps({ testID: 'loading-state' })).toBeTruthy();
  });

  it('shows an error state with retry on failure', () => {
    const refetch = jest.fn();
    mockUseInfiniteActionsListQuery.mockReturnValue({ isPending: false, isError: true, error: new Error('x'), refetch });
    const renderer = render();
    act(() => renderer.root.findByProps({ testID: 'error-state-retry' }).props.onPress());
    expect(refetch).toHaveBeenCalled();
  });

  it('defaults to open items only', () => {
    mockActionsSuccess([]);
    render();
    expect(mockUseInfiniteActionsListQuery).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'open' }),
    );
  });

  it('toggling "Hiện việc đã xong" drops the status filter', () => {
    mockActionsSuccess([]);
    const renderer = render();
    const toggle = renderer.root.findByProps({ value: false });
    act(() => toggle.props.onValueChange(true));
    expect(mockUseInfiniteActionsListQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: undefined }),
    );
  });

  it('renders every action row with its meeting title', () => {
    mockActionsSuccess([actionItem({ id: 'a1' }), actionItem({ id: 'a2', content: 'Sửa lỗi authentication' })]);
    const renderer = render();
    expect(allTexts(renderer)).toContain('Hoàn thiện API docs');
    expect(allTexts(renderer)).toContain('Sửa lỗi authentication');
  });

  it('tapping a row body pushes meeting detail with its meeting id', () => {
    mockActionsSuccess([actionItem({ id: 'a1' })]);
    const renderer = render();
    const row = renderer.root
      .findAll((node) => node.props.accessibilityRole === 'button' && typeof node.props.onPress === 'function')
      .find((node) => node.findAllByType(Text).some((textNode) => textNode.props.children === 'Hoàn thiện API docs'));
    act(() => row?.props.onPress());
    expect(mockPush).toHaveBeenCalledWith({ pathname: MEETING_DETAIL_ROUTE, params: { id: 'm1' } });
  });

  it('tapping a checkbox toggles status via the update mutation', () => {
    mockActionsSuccess([actionItem({ id: 'a1', status: 'open' })]);
    const renderer = render();
    act(() => {
      renderer.root.findByProps({ testID: 'action-item-row-checkbox-a1' }).props.onPress();
    });
    expect(mockUpdateMutate).toHaveBeenCalledWith({ id: 'a1', body: { status: 'done' } });
  });

  it('selecting an assignee chip filters by assignee_entity_id', () => {
    mockActionsSuccess([]);
    const renderer = render();
    const chip = renderer.root
      .findAll((node) => node.props.accessibilityRole === 'button')
      .find((node) => node.findAllByType(Text).some((textNode) => textNode.props.children === 'Bình'));
    act(() => chip?.props.onPress());
    expect(mockUseInfiniteActionsListQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ assignee_entity_id: 'e1' }),
    );
  });

  it('shows an empty state when there are no action items', () => {
    mockActionsSuccess([]);
    const renderer = render();
    expect(allTexts(renderer)).toContain('Chưa có việc cần làm');
  });
});
