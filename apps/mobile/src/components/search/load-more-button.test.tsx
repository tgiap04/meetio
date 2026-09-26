import TestRenderer, { act } from 'react-test-renderer';
import { ActivityIndicator, Text } from 'react-native';
import { LoadMoreButton } from './load-more-button';

function render(loading: boolean, onPress = jest.fn()) {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<LoadMoreButton loading={loading} onPress={onPress} />);
  });
  return { renderer, onPress };
}

describe('LoadMoreButton', () => {
  it('shows the "Tải thêm" label and calls onPress when tapped', () => {
    const { renderer, onPress } = render(false);
    expect(renderer.root.findByType(Text).props.children).toBe('Tải thêm');
    act(() => {
      renderer.root.findByProps({ testID: 'search-load-more' }).props.onPress();
    });
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('shows a spinner instead of the label while loading, and is disabled', () => {
    const { renderer } = render(true);
    expect(renderer.root.findByType(ActivityIndicator)).toBeTruthy();
    expect(renderer.root.findByProps({ testID: 'search-load-more' }).props.disabled).toBe(true);
  });
});
