import TestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { ActionItemCard } from './action-item-card';
import type { ActionItem } from '../../mocks/types';

const ITEM: ActionItem = {
  id: 'action-1',
  title: 'Hoàn thiện API docs',
  assignee: 'Bình',
  due: '15/05',
};

function render(checked: boolean, onToggle = jest.fn()) {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<ActionItemCard checked={checked} item={ITEM} onToggle={onToggle} />);
  });
  return { renderer, onToggle };
}

describe('ActionItemCard', () => {
  it('renders the title and the "assignee · due" meta line', () => {
    const { renderer } = render(false);
    const texts = renderer.root.findAllByType(Text).map((node) => node.props.children).flat().join('');
    expect(texts).toContain('Hoàn thiện API docs');
    expect(texts).toContain('Bình');
    expect(texts).toContain('15/05');
  });

  it('reflects an unchecked state in its accessibility state and label', () => {
    const { renderer } = render(false);
    const checkbox = renderer.root.findByProps({ testID: 'action-item-checkbox-action-1' });
    expect(checkbox.props.accessibilityState).toEqual({ checked: false });
    expect(checkbox.props.accessibilityLabel).toContain('chưa hoàn thành');
  });

  it('reflects a checked state in its accessibility state and label', () => {
    const { renderer } = render(true);
    const checkbox = renderer.root.findByProps({ testID: 'action-item-checkbox-action-1' });
    expect(checkbox.props.accessibilityState).toEqual({ checked: true });
    expect(checkbox.props.accessibilityLabel).toContain('đã hoàn thành');
  });

  it('calls onToggle with the item id when tapped', () => {
    const { renderer, onToggle } = render(false);
    const checkbox = renderer.root.findByProps({ testID: 'action-item-checkbox-action-1' });
    act(() => {
      checkbox.props.onPress();
    });
    expect(onToggle).toHaveBeenCalledWith('action-1');
  });
});
