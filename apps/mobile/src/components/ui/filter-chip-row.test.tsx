import TestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { FilterChipRow } from './filter-chip-row';

const CHIPS = [
  { key: 'all', label: 'Tất cả' },
  { key: 'person', label: 'Person' },
  { key: 'task', label: 'Task' },
];

// react-native's Pressable renders as three layers (the `Pressable` component,
// a `forwardRef` View, and the host `View`), all carrying `accessibilityRole`
// — `findAllByProps` matches all three per chip. Only the outermost layer
// (the actual `Pressable` component) also carries `onPress`, so filtering on
// that gives exactly one match per chip.
function findChips(renderer: TestRenderer.ReactTestRenderer) {
  return renderer.root.findAll(
    (node) => node.props.accessibilityRole === 'button' && typeof node.props.onPress === 'function',
  );
}

describe('FilterChipRow', () => {
  it('renders every chip label', () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<FilterChipRow activeKey="all" chips={CHIPS} onChange={jest.fn()} />);
    });
    const texts = renderer.root.findAllByType(Text).map((n) => n.props.children);
    expect(texts).toEqual(['Tất cả', 'Person', 'Task']);
  });

  it('marks only the active chip as selected', () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<FilterChipRow activeKey="task" chips={CHIPS} onChange={jest.fn()} />);
    });
    const chips = findChips(renderer);
    expect(chips.map((c) => c.props.accessibilityState.selected)).toEqual([false, false, true]);
  });

  it('calls onChange with the tapped chip key', () => {
    const onChange = jest.fn();
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<FilterChipRow activeKey="all" chips={CHIPS} onChange={onChange} />);
    });
    act(() => {
      findChips(renderer)[1].props.onPress();
    });
    expect(onChange).toHaveBeenCalledWith('person');
  });
});
