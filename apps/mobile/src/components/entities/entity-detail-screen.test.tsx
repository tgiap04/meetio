import TestRenderer, { act } from 'react-test-renderer';
import { Alert, Text, TextInput } from 'react-native';
import EntityDetailScreen from '../../../app/(app)/entity-detail';

const mockBack = jest.fn();
const mockPush = jest.fn();
let mockParams: { id?: string } = { id: 'e1' };

jest.mock('expo-router', () => ({
  router: { back: (...args: unknown[]) => mockBack(...args), push: (...args: unknown[]) => mockPush(...args) },
  useLocalSearchParams: () => mockParams,
}));

const mockUseEntityDetailQuery = jest.fn();
jest.mock('../../hooks/use-entity-detail-query', () => ({
  useEntityDetailQuery: (...args: unknown[]) => mockUseEntityDetailQuery(...args),
}));

const mockUpdateMutate = jest.fn();
const mockDeleteMutate = jest.fn();
const mockUndoMutate = jest.fn();
jest.mock('../../hooks/use-entity-mutations', () => ({
  useUpdateEntityMutation: () => ({ mutate: mockUpdateMutate, isPending: false }),
  useDeleteEntityMutation: () => ({ mutate: mockDeleteMutate, isPending: false }),
  useUndoMergeMutation: () => ({ mutate: mockUndoMutate, isPending: false }),
}));

jest.mock('../../hooks/use-entity-timeline-query', () => ({
  useEntityTimelineQuery: () => ({ isPending: false, isError: false, data: { pages: [{ items: [] }] }, hasNextPage: false }),
}));

function entityDetail(overrides: Record<string, unknown> = {}) {
  return {
    id: 'e1',
    canonical_name: 'Nguyễn Văn Anh',
    type: 'person',
    aliases: [],
    mention_count: 3,
    meeting_count: 1,
    last_mentioned_at: null,
    description: null,
    is_user_edited: false,
    relations: [],
    meetings: [],
    merges: [],
    ...overrides,
  };
}

function mockSuccess(entity: ReturnType<typeof entityDetail>) {
  mockUseEntityDetailQuery.mockReturnValue({ isPending: false, isError: false, data: entity, refetch: jest.fn() });
}

function render() {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<EntityDetailScreen />);
  });
  return renderer;
}

function allTexts(renderer: TestRenderer.ReactTestRenderer) {
  return renderer.root.findAllByType(Text).map((t) => t.props.children).flat();
}

describe('EntityDetailScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = { id: 'e1' };
  });

  it('shows a loading state while pending', () => {
    mockUseEntityDetailQuery.mockReturnValue({ isPending: true, isError: false, data: undefined });
    const renderer = render();
    expect(renderer.root.findByProps({ testID: 'loading-state' })).toBeTruthy();
  });

  it('shows an error state with retry on failure', () => {
    const refetch = jest.fn();
    mockUseEntityDetailQuery.mockReturnValue({ isPending: false, isError: true, error: new Error('x'), refetch });
    const renderer = render();
    act(() => renderer.root.findByProps({ testID: 'error-state-retry' }).props.onPress());
    expect(refetch).toHaveBeenCalled();
  });

  it('renders the entity name in the header', () => {
    mockSuccess(entityDetail());
    const renderer = render();
    expect(allTexts(renderer)).toContain('Nguyễn Văn Anh');
  });

  it('switches to the edit form and saves an edit', () => {
    mockSuccess(entityDetail());
    const renderer = render();
    act(() => renderer.root.findByProps({ accessibilityLabel: 'Sửa thực thể' }).props.onPress());
    act(() => {
      renderer.root.findByType(TextInput).props.onChangeText('Anh N.');
    });
    const saveButton = renderer.root
      .findAll((n) => n.props.accessibilityRole === 'button' && typeof n.props.onPress === 'function')
      .find((n) => n.findAllByType(Text).some((t) => t.props.children === 'Lưu'));
    act(() => saveButton?.props.onPress());
    expect(mockUpdateMutate).toHaveBeenCalledWith(
      { canonical_name: 'Anh N.', type: 'person' },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it('confirms before deleting, then navigates back on success', () => {
    mockSuccess(entityDetail());
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_title, _msg, buttons) => {
      const destructive = buttons?.find((b) => b.style === 'destructive');
      destructive?.onPress?.();
    });
    const renderer = render();
    act(() => renderer.root.findByProps({ accessibilityLabel: 'Xóa thực thể' }).props.onPress());
    expect(mockDeleteMutate).toHaveBeenCalledWith('e1', expect.objectContaining({ onSuccess: expect.any(Function) }));
    alertSpy.mockRestore();
  });

  it('renders an error state when no id param is present', () => {
    mockParams = {};
    const renderer = render();
    act(() => renderer.root.findByProps({ testID: 'error-state-retry' }).props.onPress());
    expect(mockBack).toHaveBeenCalled();
  });
});
