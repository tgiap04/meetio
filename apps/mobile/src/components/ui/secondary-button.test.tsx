import TestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { SecondaryButton } from './secondary-button';

// react-native's Pressable is `React.memo(Pressable)`; react-test-renderer
// flattens the memo wrapper, so `findByType(Pressable)` never matches —
// locate it by the accessibility prop it always sets instead.
function findButton(renderer: TestRenderer.ReactTestRenderer) {
  return renderer.root.findByProps({ accessibilityRole: 'button' });
}

describe('SecondaryButton', () => {
  it('renders the label', () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<SecondaryButton label="Xem chi tiết tiến trình" onPress={jest.fn()} />);
    });
    expect(renderer.root.findByType(Text).props.children).toBe('Xem chi tiết tiến trình');
  });

  it('calls onPress when tapped', () => {
    const onPress = jest.fn();
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<SecondaryButton label="X" onPress={onPress} />);
    });
    act(() => {
      findButton(renderer).props.onPress();
    });
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('is disabled and does not accept presses when disabled', () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<SecondaryButton disabled label="X" onPress={jest.fn()} />);
    });
    expect(findButton(renderer).props.disabled).toBe(true);
  });
});
