import TestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { BottomTabBar, type TabBarItem } from './bottom-tab-bar';

const ITEMS: TabBarItem[] = [
  { key: 'home', label: 'Trang chủ', icon: 'home', focused: true, onPress: jest.fn() },
  { key: 'library', label: 'Thư viện', icon: 'library', focused: false, onPress: jest.fn() },
  { key: 'search', label: 'Tìm kiếm', icon: 'search', focused: false, onPress: jest.fn() },
  { key: 'settings', label: 'Cài đặt', icon: 'settings', focused: false, onPress: jest.fn() },
];

// react-native's Pressable renders as three layers (the `Pressable` component,
// a `forwardRef` View, and the host `View`), all carrying `accessibilityRole`
// — `findAllByProps` matches all three per tab. Only the outermost layer
// (the actual `Pressable` component) also carries `onPress`, so filtering on
// that gives exactly one match per tab. `@expo/vector-icons` also renders its
// glyph as a `Text` node, so text assertions filter to string children only.
function findTabs(renderer: TestRenderer.ReactTestRenderer) {
  return renderer.root.findAll(
    (node) => node.props.accessibilityRole === 'button' && typeof node.props.onPress === 'function',
  );
}

function stringTexts(renderer: TestRenderer.ReactTestRenderer) {
  return renderer.root
    .findAllByType(Text)
    .map((n) => n.props.children)
    .filter((c): c is string => typeof c === 'string' && c.length > 0);
}

describe('BottomTabBar', () => {
  it('renders all four tab labels', () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<BottomTabBar items={ITEMS} />);
    });
    expect(stringTexts(renderer)).toEqual(['Trang chủ', 'Thư viện', 'Tìm kiếm', 'Cài đặt']);
  });

  it('marks only the focused tab as selected', () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<BottomTabBar items={ITEMS} />);
    });
    const tabs = findTabs(renderer);
    expect(tabs.map((t) => t.props.accessibilityState.selected)).toEqual([true, false, false, false]);
  });

  it('calls the tapped item onPress callback', () => {
    const onPress = jest.fn();
    const items: TabBarItem[] = [{ key: 'library', label: 'Thư viện', icon: 'library', focused: false, onPress }];
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<BottomTabBar items={items} />);
    });
    act(() => {
      findTabs(renderer)[0].props.onPress();
    });
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
