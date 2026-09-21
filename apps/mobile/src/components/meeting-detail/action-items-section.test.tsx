import TestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { ActionItemsSection } from './action-items-section';
import type { ActionItem } from '../../mocks/types';

const ITEMS: readonly ActionItem[] = [
  { id: 'action-1', title: 'Hoàn thiện API docs', assignee: 'Bình', due: '15/05' },
  { id: 'action-2', title: 'Sửa lỗi authentication', assignee: 'Minh', due: '16/05' },
];

function render(checkedIds: ReadonlySet<string>, onToggle = jest.fn()) {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<ActionItemsSection checkedIds={checkedIds} items={ITEMS} onToggle={onToggle} />);
  });
  return { renderer, onToggle };
}

describe('ActionItemsSection', () => {
  it('renders the "Action Items" heading and every item title', () => {
    const { renderer } = render(new Set());
    const texts = renderer.root.findAllByType(Text).map((node) => node.props.children).flat().join('');
    expect(texts).toContain('Action Items');
    expect(texts).toContain('Hoàn thiện API docs');
    expect(texts).toContain('Sửa lỗi authentication');
  });

  it('marks only the checked item ids as checked', () => {
    const { renderer } = render(new Set(['action-2']));
    const checkbox1 = renderer.root.findByProps({ testID: 'action-item-checkbox-action-1' });
    const checkbox2 = renderer.root.findByProps({ testID: 'action-item-checkbox-action-2' });
    expect(checkbox1.props.accessibilityState).toEqual({ checked: false });
    expect(checkbox2.props.accessibilityState).toEqual({ checked: true });
  });

  it('reports the tapped item id up through onToggle', () => {
    const { renderer, onToggle } = render(new Set());
    const checkbox2 = renderer.root.findByProps({ testID: 'action-item-checkbox-action-2' });
    act(() => {
      checkbox2.props.onPress();
    });
    expect(onToggle).toHaveBeenCalledWith('action-2');
  });
});
