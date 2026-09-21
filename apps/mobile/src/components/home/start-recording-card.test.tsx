import TestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { StartRecordingCard } from './start-recording-card';

describe('StartRecordingCard', () => {
  it('renders the title and subtitle copy', () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<StartRecordingCard onPress={jest.fn()} />);
    });
    const texts = renderer.root
      .findAllByType(Text)
      .map((node) => node.props.children)
      .filter((children) => typeof children === 'string');
    expect(texts).toEqual(['Bắt đầu ghi âm', 'Từ thiết bị này']);
  });

  it('calls onPress when tapped', () => {
    const onPress = jest.fn();
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<StartRecordingCard onPress={onPress} />);
    });
    act(() => {
      renderer.root.findByProps({ accessibilityRole: 'button' }).props.onPress();
    });
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
