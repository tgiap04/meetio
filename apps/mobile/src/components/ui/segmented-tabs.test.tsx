import TestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { SegmentedTabs } from './segmented-tabs';

const ITEMS = [
  { key: 'vi', label: 'Tiếng Việt' },
  { key: 'en', label: 'Tiếng Anh' },
];

// react-native's Pressable renders as three layers (the `Pressable` component,
// a `forwardRef` View, and the host `View`), all carrying `accessibilityRole`
// — `findAllByProps` matches all three per tab. Only the outermost layer
// (the actual `Pressable` component) also carries `onPress`, so filtering on
// that gives exactly one match per tab.
function findTabs(renderer: TestRenderer.ReactTestRenderer) {
  return renderer.root.findAll(
    (node) => node.props.accessibilityRole === 'tab' && typeof node.props.onPress === 'function',
  );
}

describe('SegmentedTabs', () => {
  it('renders every item label', () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<SegmentedTabs activeKey="vi" items={ITEMS} onChange={jest.fn()} />);
    });
    const texts = renderer.root.findAllByType(Text).map((n) => n.props.children);
    expect(texts).toEqual(['Tiếng Việt', 'Tiếng Anh']);
  });

  it('marks the active tab as selected', () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<SegmentedTabs activeKey="en" items={ITEMS} onChange={jest.fn()} />);
    });
    const tabs = findTabs(renderer);
    expect(tabs[0].props.accessibilityState.selected).toBe(false);
    expect(tabs[1].props.accessibilityState.selected).toBe(true);
  });

  it('calls onChange with the tapped key', () => {
    const onChange = jest.fn();
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<SegmentedTabs activeKey="vi" items={ITEMS} onChange={onChange} />);
    });
    act(() => {
      findTabs(renderer)[1].props.onPress();
    });
    expect(onChange).toHaveBeenCalledWith('en');
  });
});
