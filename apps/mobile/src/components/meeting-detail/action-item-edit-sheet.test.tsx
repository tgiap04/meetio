import TestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import type { MeetingActionItem } from '@meetio/shared';
import { useInfiniteEntitiesQuery } from '../../hooks/use-entities-query';
import { ActionItemEditSheet, type ActionItemEditSheetProps } from './action-item-edit-sheet';

jest.mock('../../hooks/use-entities-query', () => ({
  useInfiniteEntitiesQuery: jest.fn(),
}));

(useInfiniteEntitiesQuery as jest.Mock).mockReturnValue({ data: { pages: [{ items: [], next_offset: null }] }, isPending: false });

function item(overrides: Partial<MeetingActionItem> = {}): MeetingActionItem {
  return {
    id: 'a1',
    meeting_id: 'm1',
    content: 'Hoàn thiện API docs',
    assignee_entity_id: 'e1',
    assignee_name: 'Bình',
    due_date: '2026-05-15',
    status: 'open',
    is_manual: false,
    source_chunk_id: null,
    segment_seq: null,
    created_at: '2026-05-01T00:00:00.000Z',
    ...overrides,
  };
}

function render(props: Partial<ActionItemEditSheetProps> = {}) {
  const handlers = { onClose: jest.fn(), onSave: jest.fn() };
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<ActionItemEditSheet saving={false} visible {...handlers} {...props} />);
  });
  return { renderer, ...handlers };
}

describe('ActionItemEditSheet', () => {
  it('seeds the form from the given item when editing', () => {
    const { renderer } = render({ item: item() });
    const contentInput = renderer.root.findByProps({ accessibilityLabel: 'Nội dung việc cần làm' });
    const dueInput = renderer.root.findByProps({ accessibilityLabel: 'Hạn việc cần làm' });
    expect(contentInput.props.value).toBe('Hoàn thiện API docs');
    expect(dueInput.props.value).toBe('15/05/2026');
    const texts = renderer.root.findAllByType(Text).map((node) => node.props.children).flat().join('');
    expect(texts).toContain('Bình');
    expect(texts).toContain('Sửa việc cần làm');
  });

  it('starts blank for a new item', () => {
    const { renderer } = render();
    const texts = renderer.root.findAllByType(Text).map((node) => node.props.children).flat().join('');
    expect(texts).toContain('Thêm việc cần làm');
    expect(texts).toContain('Chưa chọn');
  });

  it('disables Save while content is blank', () => {
    const { renderer } = render();
    const saveButton = renderer.root
      .findAllByProps({ accessibilityRole: 'button' })
      .find((node) => node.findAllByType(Text).some((textNode) => textNode.props.children === 'Lưu'));
    expect(saveButton?.props.accessibilityState).toEqual({ disabled: true });
  });

  it('blocks save and shows an error on a malformed due date', () => {
    const { renderer, onSave } = render({ item: item() });
    const dueInput = renderer.root.findByProps({ accessibilityLabel: 'Hạn việc cần làm' });
    act(() => dueInput.props.onChangeText('31/04/2026'));
    const saveButton = renderer.root
      .findAllByProps({ accessibilityRole: 'button' })
      .find((node) => node.findAllByType(Text).some((textNode) => textNode.props.children === 'Lưu'));
    act(() => saveButton?.props.onPress());
    expect(onSave).not.toHaveBeenCalled();
    const texts = renderer.root.findAllByType(Text).map((node) => node.props.children).flat().join('');
    expect(texts).toContain('Ngày không hợp lệ, dùng định dạng dd/MM/yyyy.');
  });

  it('calls onSave with the parsed payload on a valid save', () => {
    const { renderer, onSave } = render({ item: item() });
    const contentInput = renderer.root.findByProps({ accessibilityLabel: 'Nội dung việc cần làm' });
    act(() => contentInput.props.onChangeText('Nội dung mới'));
    const saveButton = renderer.root
      .findAllByProps({ accessibilityRole: 'button' })
      .find((node) => node.findAllByType(Text).some((textNode) => textNode.props.children === 'Lưu'));
    act(() => saveButton?.props.onPress());
    expect(onSave).toHaveBeenCalledWith({ content: 'Nội dung mới', assignee_entity_id: 'e1', due_date: '2026-05-15' });
  });

  it('opens the assignee picker when the assignee field is tapped', () => {
    const { renderer } = render({ item: item() });
    act(() => {
      renderer.root.findByProps({ testID: 'action-item-edit-assignee-field' }).props.onPress();
    });
    expect(useInfiniteEntitiesQuery).toHaveBeenCalledWith(expect.objectContaining({ type: 'person' }), true);
  });

  it('calls onClose when Hủy is tapped', () => {
    const { renderer, onClose } = render();
    const cancelButton = renderer.root
      .findAllByProps({ accessibilityRole: 'button' })
      .find((node) => node.findAllByType(Text).some((textNode) => textNode.props.children === 'Hủy'));
    act(() => cancelButton?.props.onPress());
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
