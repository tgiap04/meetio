import TestRenderer, { act } from 'react-test-renderer';
import { ActivityIndicator, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { PrimaryButton } from './primary-button';
import { colors } from '../theme/colors';

function renderSync(element: React.ReactElement): TestRenderer.ReactTestRenderer {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(element);
  });
  return renderer;
}

// react-native's Pressable is `React.memo(Pressable)`; react-test-renderer flattens
// the memo wrapper, so `findByType(Pressable)` never matches. Locate it by the
// accessibility props the component always sets instead.
function findPressable(renderer: TestRenderer.ReactTestRenderer) {
  return renderer.root.findByProps({ accessibilityRole: 'button' });
}

describe('PrimaryButton', () => {
  it('paints the measured diagonal gradient rather than a flat colour', () => {
    const renderer = renderSync(<PrimaryButton label="Tiếp tục" onPress={() => {}} />);
    const gradient = renderer.root.findByType(LinearGradient);

    expect(gradient.props.colors).toEqual([colors.primaryGradientFrom, colors.primaryGradientTo]);
    expect(gradient.props.start).toEqual({ x: 0, y: 0 });
    expect(gradient.props.end).toEqual({ x: 1, y: 1 });
  });

  it('passes PressableProps like testID and accessibilityLabel down to the host node', () => {
    const renderer = renderSync(
      <PrimaryButton
        label="Tiếp tục"
        onPress={() => {}}
        testID="continue-button"
        accessibilityLabel="Tiếp tục đăng ký"
      />,
    );

    const pressable = findPressable(renderer);
    expect(pressable.props.testID).toBe('continue-button');
    expect(pressable.props.accessibilityLabel).toBe('Tiếp tục đăng ký');
    expect(pressable.props.accessibilityRole).toBe('button');
  });

  it('marks the underlying Pressable disabled, which blocks onPress at the RN level', () => {
    // Pressable.disabled is what actually stops the touch responder from firing
    // onPress (RN's own tested contract) — calling pressable.props.onPress()
    // directly would bypass that responder and prove nothing about our wiring.
    // What this component is responsible for is forwarding disabled/accessibilityState
    // correctly, so that's what this asserts.
    const onPress = jest.fn();
    const renderer = renderSync(<PrimaryButton label="Tiếp tục" onPress={onPress} disabled testID="btn" />);

    const pressable = findPressable(renderer);
    expect(pressable.props.disabled).toBe(true);
    expect(pressable.props.accessibilityState).toEqual({ disabled: true });
    expect(pressable.props.onPress).toBe(onPress);
  });

  it('shows the ActivityIndicator and hides the label while loading', () => {
    const renderer = renderSync(<PrimaryButton label="Tiếp tục" onPress={() => {}} loading testID="btn" />);

    expect(renderer.root.findByType(ActivityIndicator)).toBeTruthy();
    expect(renderer.root.findAllByType(Text)).toHaveLength(0);

    const pressable = findPressable(renderer);
    expect(pressable.props.accessibilityState).toEqual({ disabled: true });
  });
});
