import TestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { LibraryHeader } from './library-header';

function render() {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<LibraryHeader />);
  });
  return renderer;
}

describe('LibraryHeader', () => {
  it('renders the corrected "Thư viện" title', () => {
    const renderer = render();
    const texts = renderer.root.findAllByType(Text).map((node) => node.props.children).flat();
    expect(texts).toContain('Thư viện');
  });

  it('never renders the crop\'s copy-pasted "Hỏi đáp AI" title', () => {
    const renderer = render();
    const texts = renderer.root.findAllByType(Text).map((node) => node.props.children).flat();
    expect(texts.join(' ')).not.toContain('Hỏi đáp AI');
  });

  it('renders no back button — a tab root has nothing to return to', () => {
    const renderer = render();
    expect(
      renderer.root.findAll((node) => node.props.accessibilityRole === 'button' && typeof node.props.onPress === 'function'),
    ).toHaveLength(0);
  });
});
