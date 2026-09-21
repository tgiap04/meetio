import TestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { SecondaryActionRow } from './secondary-action-row';

describe('SecondaryActionRow', () => {
  it('renders the label', () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<SecondaryActionRow icon="audioFile" label="Nhập từ file âm thanh" />);
    });
    const texts = renderer.root
      .findAllByType(Text)
      .map((node) => node.props.children)
      .filter((children) => typeof children === 'string');
    expect(texts).toEqual(['Nhập từ file âm thanh']);
  });

  it('is not a Pressable — and has no accessibilityRole — when onPress is omitted', () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<SecondaryActionRow icon="castDevice" label="Kết nối thiết bị khác" />);
    });
    expect(renderer.root.findAllByProps({ accessibilityRole: 'button' })).toHaveLength(0);
  });

  it('becomes a button and calls onPress when one is given', () => {
    const onPress = jest.fn();
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<SecondaryActionRow icon="audioFile" label="x" onPress={onPress} />);
    });
    act(() => {
      renderer.root.findByProps({ accessibilityRole: 'button' }).props.onPress();
    });
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
