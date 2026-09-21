import TestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { RadioRow } from './radio-row';

function stringTexts(renderer: TestRenderer.ReactTestRenderer) {
  return renderer.root
    .findAllByType(Text)
    .map((n) => n.props.children)
    .filter((c): c is string => typeof c === 'string' && c.length > 0);
}

describe('RadioRow', () => {
  it('renders the label and description', () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <RadioRow description="Ghi âm từ microphone điện thoại" label="Micro trên thiết bị" onPress={jest.fn()} selected />,
      );
    });
    expect(stringTexts(renderer)).toEqual(['Micro trên thiết bị', 'Ghi âm từ microphone điện thoại']);
  });

  it('shows the trailing dot only when selected', () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<RadioRow label="Thiết bị ngoài" onPress={jest.fn()} selected={false} />);
    });
    expect(renderer.root.findAllByProps({ testID: 'radio-row-trailing-dot' }).length).toBe(0);

    act(() => {
      renderer = TestRenderer.create(<RadioRow label="Thiết bị ngoài" onPress={jest.fn()} selected />);
    });
    // `View` renders as a composite + host layer pair (same reason
    // `segmented-tabs.test.tsx` filters Pressable by an extra prop) — both
    // layers carry `testID`, so presence (not an exact count) is what proves
    // the dot rendered.
    expect(renderer.root.findAllByProps({ testID: 'radio-row-trailing-dot' }).length).toBeGreaterThan(0);
  });

  it('calls onPress when tapped', () => {
    const onPress = jest.fn();
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<RadioRow label="Thiết bị ngoài" onPress={onPress} selected={false} />);
    });
    act(() => {
      renderer.root.findByProps({ accessibilityRole: 'radio' }).props.onPress();
    });
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
