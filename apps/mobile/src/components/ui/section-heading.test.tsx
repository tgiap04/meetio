import TestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { SectionHeading } from './section-heading';

// react-native's Pressable is `React.memo(Pressable)`; react-test-renderer
// flattens the memo wrapper, so `findByType(Pressable)` never matches —
// locate it by the accessibility prop it always sets instead.
function findButton(renderer: TestRenderer.ReactTestRenderer) {
  return renderer.root.findByProps({ accessibilityRole: 'button' });
}

describe('SectionHeading', () => {
  it('renders the title only when no trailing label is given', () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<SectionHeading title="Cuộc họp gần đây" />);
    });
    expect(renderer.root.findAllByType(Text)).toHaveLength(1);
    expect(renderer.root.findByType(Text).props.children).toBe('Cuộc họp gần đây');
  });

  it('renders the trailing link and calls onTrailingPress', () => {
    const onTrailingPress = jest.fn();
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <SectionHeading onTrailingPress={onTrailingPress} title="Cuộc họp gần đây" trailingLabel="Xem tất cả" />,
      );
    });
    const texts = renderer.root.findAllByType(Text).map((n) => n.props.children);
    expect(texts).toEqual(['Cuộc họp gần đây', 'Xem tất cả']);
    act(() => {
      findButton(renderer).props.onPress();
    });
    expect(onTrailingPress).toHaveBeenCalledTimes(1);
  });
});
