import TestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import type { MeetingActionItem } from '@meetio/shared';
import { ActionItemsSection } from './action-items-section';

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

const ITEMS: readonly MeetingActionItem[] = [
  item({ id: 'a1', content: 'Hoàn thiện API docs' }),
  item({ id: 'a2', content: 'Sửa lỗi authentication', status: 'done' }),
];

function render(items: readonly MeetingActionItem[] = ITEMS) {
  const handlers = {
    onToggle: jest.fn(),
    onEdit: jest.fn(),
    onDelete: jest.fn(),
    onOpenTranscript: jest.fn(),
    onAddPress: jest.fn(),
  };
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<ActionItemsSection items={items} {...handlers} />);
  });
  return { renderer, ...handlers };
}

describe('ActionItemsSection', () => {
  it('renders the "Action Items" heading and every item content', () => {
    const { renderer } = render();
    const texts = renderer.root.findAllByType(Text).map((node) => node.props.children).flat().join('');
    expect(texts).toContain('Action Items');
    expect(texts).toContain('Hoàn thiện API docs');
    expect(texts).toContain('Sửa lỗi authentication');
  });

  it('reports the tapped item id up through onToggle', () => {
    const { renderer, onToggle } = render();
    const checkbox2 = renderer.root.findByProps({ testID: 'action-item-checkbox-a2' });
    act(() => checkbox2.props.onPress());
    expect(onToggle).toHaveBeenCalledWith('a2');
  });

  it('calls onAddPress when "Thêm việc" is tapped', () => {
    const { renderer, onAddPress } = render();
    const texts = renderer.root.findAllByType(Text);
    const addLabel = texts.find((node) => node.props.children === 'Thêm việc');
    expect(addLabel).toBeTruthy();
    const addRow = renderer.root.findAllByProps({ accessibilityRole: 'button' }).find((node) =>
      node.findAllByType(Text).some((textNode) => textNode.props.children === 'Thêm việc'),
    );
    act(() => addRow?.props.onPress());
    expect(onAddPress).toHaveBeenCalledTimes(1);
  });
});
