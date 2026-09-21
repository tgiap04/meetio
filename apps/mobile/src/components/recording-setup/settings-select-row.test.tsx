import TestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { SettingsSelectRow } from './settings-select-row';

describe('SettingsSelectRow', () => {
  it('renders the value text', () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<SettingsSelectRow value="Tiếng Việt" />);
    });
    const texts = renderer.root
      .findAllByType(Text)
      .map((n) => n.props.children)
      .filter((c): c is string => typeof c === 'string' && c.length > 0);
    expect(texts).toEqual(['Tiếng Việt']);
  });

  it('renders as non-interactive when no onPress is given', () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<SettingsSelectRow value="Tiếng Việt" />);
    });
    expect(renderer.root.findAllByProps({ accessibilityRole: 'button' })).toHaveLength(0);
  });

  it('calls onPress when tapped', () => {
    const onPress = jest.fn();
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<SettingsSelectRow onPress={onPress} value="Tiếng Việt" />);
    });
    act(() => {
      renderer.root.findByProps({ accessibilityRole: 'button' }).props.onPress();
    });
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('dims the row when dimmed is true', () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<SettingsSelectRow dimmed onPress={jest.fn()} value="Dịch sang Tiếng Anh" />);
    });
    const dimmedNode = renderer.root.findAll(
      (node) => Array.isArray(node.props.style) && node.props.style.some((s: unknown) => (s as { opacity?: number })?.opacity === 0.4),
    );
    expect(dimmedNode.length).toBeGreaterThan(0);
  });
});
