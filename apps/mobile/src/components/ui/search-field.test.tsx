import TestRenderer, { act } from 'react-test-renderer';
import { TextInput } from 'react-native';
import { SearchField } from './search-field';

// react-native's Pressable is `React.memo(Pressable)`; react-test-renderer flattens
// the memo wrapper, so `findByType(Pressable)` never matches — locate it by the
// accessibility props it always sets instead (same convention as `primary-button.test.tsx`).
function findFilterButton(renderer: TestRenderer.ReactTestRenderer) {
  return renderer.root.findByProps({ accessibilityLabel: 'Bộ lọc' });
}

describe('SearchField', () => {
  it('renders the placeholder and current value', () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <SearchField onChangeText={jest.fn()} placeholder="Tìm kiếm trong transcript..." value="" />,
      );
    });
    const input = renderer.root.findByType(TextInput);
    expect(input.props.placeholder).toBe('Tìm kiếm trong transcript...');
    expect(input.props.value).toBe('');
  });

  it('calls onChangeText as the user types', () => {
    const onChangeText = jest.fn();
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<SearchField onChangeText={onChangeText} placeholder="Tìm kiếm" value="" />);
    });
    act(() => {
      renderer.root.findByType(TextInput).props.onChangeText('API');
    });
    expect(onChangeText).toHaveBeenCalledWith('API');
  });

  it('omits the filter button when onFilterPress is not given', () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<SearchField onChangeText={jest.fn()} placeholder="x" value="" />);
    });
    expect(renderer.root.findAllByProps({ accessibilityLabel: 'Bộ lọc' })).toHaveLength(0);
  });

  it('calls onFilterPress when the funnel button is tapped', () => {
    const onFilterPress = jest.fn();
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <SearchField onChangeText={jest.fn()} onFilterPress={onFilterPress} placeholder="x" value="" />,
      );
    });
    act(() => {
      findFilterButton(renderer).props.onPress();
    });
    expect(onFilterPress).toHaveBeenCalledTimes(1);
  });
});
