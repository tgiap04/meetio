import TestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import type { ActionListItem } from '@meetio/shared';
import { ActionItemRow } from './action-item-row';

function item(overrides: Partial<ActionListItem> = {}): ActionListItem {
  return {
    id: 'a1',
    meeting_id: 'm1',
    meeting_title: 'Sprint Review',
    meeting_date: '15/05/2026',
    content: 'Hoàn thiện API docs',
    assignee_entity_id: null,
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

function render(overrides: Partial<ActionListItem> = {}) {
  const onToggle = jest.fn();
  const onPress = jest.fn();
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<ActionItemRow item={item(overrides)} onPress={onPress} onToggle={onToggle} />);
  });
  return { renderer, onToggle, onPress };
}

describe('ActionItemRow', () => {
  it('renders content, the assignee/due meta line, and the meeting title', () => {
    const { renderer } = render();
    const texts = renderer.root.findAllByType(Text).map((node) => node.props.children).flat().join('');
    expect(texts).toContain('Hoàn thiện API docs');
    expect(texts).toContain('Bình');
    expect(texts).toContain('15/05');
    expect(texts).toContain('Sprint Review');
  });

  it('calls onToggle with the item id when the checkbox is tapped', () => {
    const { renderer, onToggle } = render();
    act(() => {
      renderer.root.findByProps({ testID: 'action-item-row-checkbox-a1' }).props.onPress();
    });
    expect(onToggle).toHaveBeenCalledWith('a1');
  });

  it('calls onPress with the meeting id when the row body is tapped', () => {
    const { renderer, onPress } = render();
    const bodyButtons = renderer.root.findAllByProps({ accessibilityRole: 'button' });
    act(() => bodyButtons[0].props.onPress());
    expect(onPress).toHaveBeenCalledWith('m1');
  });

  it('reflects checked state for a done item', () => {
    const { renderer } = render({ status: 'done' });
    const checkbox = renderer.root.findByProps({ testID: 'action-item-row-checkbox-a1' });
    expect(checkbox.props.accessibilityState).toEqual({ checked: true });
  });
});
