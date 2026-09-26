import TestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import type { MeetingActionItem } from '@meetio/shared';
import { ActionItemCard, type ActionItemCardProps } from './action-item-card';

function item(overrides: Partial<MeetingActionItem> = {}): MeetingActionItem {
  return {
    id: 'a1',
    meeting_id: 'm1',
    content: 'Hoàn thiện API docs',
    assignee_entity_id: null,
    assignee_name: 'Bình',
    due_date: '2026-05-15',
    status: 'open',
    is_manual: false,
    source_chunk_id: 'c1',
    segment_seq: 4,
    created_at: '2026-05-01T00:00:00.000Z',
    ...overrides,
  };
}

function render(props: Partial<ActionItemCardProps> = {}) {
  let renderer!: TestRenderer.ReactTestRenderer;
  const handlers = {
    onToggle: jest.fn(),
    onEdit: jest.fn(),
    onDelete: jest.fn(),
    onOpenTranscript: jest.fn(),
  };
  act(() => {
    renderer = TestRenderer.create(<ActionItemCard item={item()} {...handlers} {...props} />);
  });
  return { renderer, ...handlers };
}

describe('ActionItemCard', () => {
  it('renders the content and the "assignee · due" meta line', () => {
    const { renderer } = render();
    const texts = renderer.root.findAllByType(Text).map((node) => node.props.children).flat().join('');
    expect(texts).toContain('Hoàn thiện API docs');
    expect(texts).toContain('Bình');
    expect(texts).toContain('15/05');
  });

  it('shows only the parts that are set — blank assignee is not replaced by a placeholder', () => {
    const { renderer } = render({ item: item({ assignee_name: null, due_date: null }) });
    const texts = renderer.root.findAllByType(Text).map((node) => node.props.children).flat().join('');
    expect(texts).not.toContain('Chưa có');
  });

  it('reflects checked/unchecked state and calls onToggle with the item id', () => {
    const { renderer, onToggle } = render();
    const checkbox = renderer.root.findByProps({ testID: 'action-item-checkbox-a1' });
    expect(checkbox.props.accessibilityState).toEqual({ checked: false });
    act(() => checkbox.props.onPress());
    expect(onToggle).toHaveBeenCalledWith('a1');
  });

  it('renders as checked and strikes through the title when status is done', () => {
    const { renderer } = render({ item: item({ status: 'done' }) });
    const checkbox = renderer.root.findByProps({ testID: 'action-item-checkbox-a1' });
    expect(checkbox.props.accessibilityState).toEqual({ checked: true });
  });

  it('tapping the body opens the transcript at segment_seq when present', () => {
    const { renderer, onOpenTranscript } = render();
    act(() => {
      renderer.root.findByProps({ testID: 'action-item-body-a1' }).props.onPress();
    });
    expect(onOpenTranscript).toHaveBeenCalledWith(4);
  });

  it('calls onEdit with the item when the edit icon is tapped', () => {
    const { renderer, onEdit } = render();
    act(() => {
      renderer.root.findByProps({ accessibilityLabel: 'Sửa việc cần làm' }).props.onPress();
    });
    expect(onEdit).toHaveBeenCalledWith(item());
  });

  it('calls onDelete with the item when the trash icon is tapped', () => {
    const { renderer, onDelete } = render();
    act(() => {
      renderer.root.findByProps({ accessibilityLabel: 'Xóa việc cần làm' }).props.onPress();
    });
    expect(onDelete).toHaveBeenCalledWith(item());
  });
});
