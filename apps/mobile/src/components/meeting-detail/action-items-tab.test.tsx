import TestRenderer, { act } from 'react-test-renderer';
import { Alert, Text } from 'react-native';
import type { MeetingActionItem } from '@meetio/shared';
import { ActionItemsTab } from './action-items-tab';
import { useMeetingActionsQuery } from '../../hooks/use-meeting-actions-query';
import {
  useCreateActionItemMutation,
  useDeleteActionItemMutation,
  useUpdateActionItemMutation,
} from '../../hooks/use-action-mutations';

jest.mock('../../hooks/use-meeting-actions-query', () => ({
  useMeetingActionsQuery: jest.fn(),
}));
jest.mock('../../hooks/use-action-mutations', () => ({
  useCreateActionItemMutation: jest.fn(),
  useUpdateActionItemMutation: jest.fn(),
  useDeleteActionItemMutation: jest.fn(),
}));
jest.mock('../../hooks/use-entities-query', () => ({
  useInfiniteEntitiesQuery: jest.fn(() => ({ data: { pages: [{ items: [], next_offset: null }] }, isPending: false })),
}));

const mockedUseMeetingActionsQuery = useMeetingActionsQuery as jest.Mock;
const mockedUseCreateActionItemMutation = useCreateActionItemMutation as jest.Mock;
const mockedUseUpdateActionItemMutation = useUpdateActionItemMutation as jest.Mock;
const mockedUseDeleteActionItemMutation = useDeleteActionItemMutation as jest.Mock;

function item(overrides: Partial<MeetingActionItem> = {}): MeetingActionItem {
  return {
    id: 'a1',
    meeting_id: 'm1',
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

function render() {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<ActionItemsTab meetingId="m1" onOpenTranscript={jest.fn()} />);
  });
  return renderer;
}

describe('ActionItemsTab', () => {
  const createMutate = jest.fn();
  const updateMutate = jest.fn();
  const deleteMutate = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockedUseCreateActionItemMutation.mockReturnValue({ mutate: createMutate, isPending: false });
    mockedUseUpdateActionItemMutation.mockReturnValue({ mutate: updateMutate, isPending: false });
    mockedUseDeleteActionItemMutation.mockReturnValue({ mutate: deleteMutate, isPending: false });
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  });

  it('renders LoadingState while the actions query is pending', () => {
    mockedUseMeetingActionsQuery.mockReturnValue({ isPending: true, isError: false });
    const renderer = render();
    expect(renderer.root.findByProps({ testID: 'loading-state' })).toBeTruthy();
  });

  it('renders ErrorState and retries on error', () => {
    const refetch = jest.fn();
    mockedUseMeetingActionsQuery.mockReturnValue({ isPending: false, isError: true, error: new Error('x'), refetch });
    const renderer = render();
    act(() => renderer.root.findByProps({ testID: 'error-state-retry' }).props.onPress());
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('toggles status via the update mutation, open -> done', () => {
    mockedUseMeetingActionsQuery.mockReturnValue({ isPending: false, isError: false, data: { items: [item()] } });
    const renderer = render();
    act(() => {
      renderer.root.findByProps({ testID: 'action-item-checkbox-a1' }).props.onPress();
    });
    expect(updateMutate).toHaveBeenCalledWith({ id: 'a1', body: { status: 'done' } });
  });

  it('opens the create sheet from "Thêm việc" and saves via the create mutation', () => {
    mockedUseMeetingActionsQuery.mockReturnValue({ isPending: false, isError: false, data: { items: [] } });
    const renderer = render();
    const addRow = renderer.root
      .findAllByProps({ accessibilityRole: 'button' })
      .find((node) => node.findAllByType(Text).some((textNode) => textNode.props.children === 'Thêm việc'));
    act(() => addRow?.props.onPress());

    const contentInput = renderer.root.findByProps({ accessibilityLabel: 'Nội dung việc cần làm' });
    act(() => contentInput.props.onChangeText('Việc mới'));
    const saveButton = renderer.root
      .findAllByProps({ accessibilityRole: 'button' })
      .find((node) => node.findAllByType(Text).some((textNode) => textNode.props.children === 'Lưu'));
    act(() => saveButton?.props.onPress());

    expect(createMutate).toHaveBeenCalledWith(
      { content: 'Việc mới', assignee_entity_id: null, due_date: null },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it('opens the edit sheet from the edit icon and saves via the update mutation', () => {
    mockedUseMeetingActionsQuery.mockReturnValue({ isPending: false, isError: false, data: { items: [item()] } });
    const renderer = render();
    act(() => {
      renderer.root.findByProps({ accessibilityLabel: 'Sửa việc cần làm' }).props.onPress();
    });
    const saveButton = renderer.root
      .findAllByProps({ accessibilityRole: 'button' })
      .find((node) => node.findAllByType(Text).some((textNode) => textNode.props.children === 'Lưu'));
    act(() => saveButton?.props.onPress());

    expect(updateMutate).toHaveBeenCalledWith(
      { id: 'a1', body: { content: 'Hoàn thiện API docs', assignee_entity_id: null, due_date: null } },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it('confirms before deleting, then calls the delete mutation with the item and meeting id', () => {
    mockedUseMeetingActionsQuery.mockReturnValue({ isPending: false, isError: false, data: { items: [item()] } });
    const renderer = render();
    act(() => {
      renderer.root.findByProps({ accessibilityLabel: 'Xóa việc cần làm' }).props.onPress();
    });
    expect(Alert.alert).toHaveBeenCalled();
    const confirmHandler = (Alert.alert as jest.Mock).mock.calls[0][2][1].onPress;
    act(() => confirmHandler());
    expect(deleteMutate).toHaveBeenCalledWith({ id: 'a1', meetingId: 'm1' });
  });
});
