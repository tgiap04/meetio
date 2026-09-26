import TestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { SearchResultSection } from './search-result-section';

function render(children: React.ReactNode, footer?: React.ReactNode) {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <SearchResultSection footer={footer} title="Transcript (2)">
        {children}
      </SearchResultSection>,
    );
  });
  return renderer;
}

describe('SearchResultSection', () => {
  it('renders the given title as a heading', () => {
    const renderer = render(<Text>row</Text>);
    expect(renderer.root.findAllByType(Text).map((n) => n.props.children)).toContain('Transcript (2)');
  });

  it('renders its children inside the section', () => {
    const renderer = render(<Text>Sprint Review</Text>);
    expect(renderer.root.findAllByType(Text).map((n) => n.props.children)).toContain('Sprint Review');
  });

  it('renders the optional footer (e.g. a "load more" control) below the children', () => {
    const renderer = render(<Text>row</Text>, <Text>Tải thêm</Text>);
    expect(renderer.root.findAllByType(Text).map((n) => n.props.children)).toContain('Tải thêm');
  });
});
