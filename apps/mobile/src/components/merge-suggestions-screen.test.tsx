import TestRenderer, { act } from 'react-test-renderer';
import { Alert, Text } from 'react-native';
import MergeSuggestionsScreen from '../../app/(app)/merge-suggestions';

const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  router: { back: (...args: unknown[]) => mockBack(...args) },
}));

const mockUseMergeSuggestionsQuery = jest.fn();
jest.mock('../hooks/use-merge-suggestions-query', () => ({
  useMergeSuggestionsQuery: (...args: unknown[]) => mockUseMergeSuggestionsQuery(...args),
}));

const mockMergeMutate = jest.fn();
const mockRejectMutate = jest.fn();
const mockUndoMutate = jest.fn();
jest.mock('../hooks/use-entity-mutations', () => ({
  useMergeEntitiesMutation: () => ({ mutate: mockMergeMutate }),
  useRejectMergeSuggestionMutation: () => ({ mutate: mockRejectMutate }),
  useUndoMergeMutation: () => ({ mutate: mockUndoMutate }),
}));

function suggestion(overrides: Record<string, unknown> = {}) {
  return {
    id: 's1',
    score: 0.9,
    a: { id: 'e1', canonical_name: 'Nguyễn Văn Anh', type: 'person', aliases: [], mention_count: 3, meeting_count: 1, last_mentioned_at: null },
    b: { id: 'e2', canonical_name: 'Anh Nguyễn', type: 'person', aliases: [], mention_count: 1, meeting_count: 1, last_mentioned_at: null },
    ...overrides,
  };
}

function render() {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<MergeSuggestionsScreen />);
  });
  return renderer;
}

function allTexts(renderer: TestRenderer.ReactTestRenderer) {
  return renderer.root.findAllByType(Text).map((t) => t.props.children).flat();
}

describe('MergeSuggestionsScreen', () => {
  beforeEach(() => jest.clearAllMocks());

  it('shows a loading state while pending', () => {
    mockUseMergeSuggestionsQuery.mockReturnValue({ isPending: true, isError: false, data: undefined });
    const renderer = render();
    expect(renderer.root.findByProps({ testID: 'loading-state' })).toBeTruthy();
  });

  it('shows an empty state with no suggestions', () => {
    mockUseMergeSuggestionsQuery.mockReturnValue({ isPending: false, isError: false, data: { items: [] } });
    const renderer = render();
    expect(allTexts(renderer)).toContain('Không có đề xuất');
  });

  it('renders a card per suggestion', () => {
    mockUseMergeSuggestionsQuery.mockReturnValue({ isPending: false, isError: false, data: { items: [suggestion()] } });
    const renderer = render();
    expect(allTexts(renderer)).toContain('Nguyễn Văn Anh');
  });

  it('confirms then merges keeping the tapped entity', () => {
    mockUseMergeSuggestionsQuery.mockReturnValue({ isPending: false, isError: false, data: { items: [suggestion()] } });
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
      const confirm = buttons?.find((b) => b.text === 'Gộp');
      confirm?.onPress?.();
    });
    const renderer = render();
    const column = renderer.root
      .findAll((n) => n.props.accessibilityRole === 'button' && typeof n.props.onPress === 'function')
      .find((n) => n.findAllByType(Text).some((t) => t.props.children === 'Nguyễn Văn Anh'));
    act(() => column?.props.onPress());
    expect(mockMergeMutate).toHaveBeenCalledWith(
      { keep_id: 'e1', merge_ids: ['e2'] },
      expect.objectContaining({ onError: expect.any(Function) }),
    );
    alertSpy.mockRestore();
  });

  it('offers an immediate undo with the returned merge record once the merge succeeds', () => {
    mockUseMergeSuggestionsQuery.mockReturnValue({ isPending: false, isError: false, data: { items: [suggestion()] } });
    const alerts: string[] = [];
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((title, _m, buttons) => {
      alerts.push(title);
      buttons?.find((b) => b.text === 'Gộp' || b.text === 'Hoàn tác')?.onPress?.();
    });
    mockMergeMutate.mockImplementation((_body, options) =>
      options.onSuccess({ entity: {}, merges: [{ id: 'm1', merged_entity_id: 'e2', merged_name: 'Anh Nguyễn', merged_at: '', undo_until: '' }] }),
    );
    const renderer = render();
    const column = renderer.root
      .findAll((n) => n.props.accessibilityRole === 'button' && typeof n.props.onPress === 'function')
      .find((n) => n.findAllByType(Text).some((t) => t.props.children === 'Nguyễn Văn Anh'));
    act(() => column?.props.onPress());

    expect(alerts).toEqual(['Gộp thực thể', 'Đã gộp']);
    expect(mockUndoMutate).toHaveBeenCalledWith('m1', expect.objectContaining({ onError: expect.any(Function) }));
    alertSpy.mockRestore();
    mockMergeMutate.mockReset();
  });

  it('rejects a suggestion when "Không trùng" is tapped', () => {
    mockUseMergeSuggestionsQuery.mockReturnValue({ isPending: false, isError: false, data: { items: [suggestion()] } });
    const renderer = render();
    const button = renderer.root
      .findAll((n) => n.props.accessibilityRole === 'button' && typeof n.props.onPress === 'function')
      .find((n) => n.findAllByType(Text).some((t) => t.props.children === 'Không trùng'));
    act(() => button?.props.onPress());
    expect(mockRejectMutate).toHaveBeenCalledWith('s1', expect.objectContaining({ onError: expect.any(Function) }));
  });
});
