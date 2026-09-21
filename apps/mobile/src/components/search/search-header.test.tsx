import TestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { SearchHeader } from './search-header';

describe('SearchHeader', () => {
  it('renders the "Tìm kiếm" title and no back button', () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<SearchHeader />);
    });
    expect(renderer.root.findByType(Text).props.children).toBe('Tìm kiếm');
    expect(renderer.root.findAllByProps({ accessibilityRole: 'button' })).toHaveLength(0);
  });
});
