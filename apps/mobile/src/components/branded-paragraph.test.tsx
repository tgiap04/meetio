import TestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { BrandedParagraph } from './branded-paragraph';

function renderSync(text: string): TestRenderer.ReactTestRenderer {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<BrandedParagraph text={text} />);
  });
  return renderer;
}

function boldTextNodes(renderer: TestRenderer.ReactTestRenderer) {
  return renderer.root.findAllByType(Text).filter((node) => {
    const style = Array.isArray(node.props.style) ? Object.assign({}, ...node.props.style) : node.props.style;
    return style?.fontWeight === '700';
  });
}

describe('BrandedParagraph', () => {
  it('bolds nothing when the brand name does not appear', () => {
    const renderer = renderSync('Ghi âm mọi cuộc họp.');
    expect(boldTextNodes(renderer)).toHaveLength(0);
  });

  it('bolds exactly one span when the brand name appears once', () => {
    const renderer = renderSync('Chào mừng đến với Meetio nhé.');
    const bolded = boldTextNodes(renderer);
    expect(bolded).toHaveLength(1);
    expect(bolded[0].props.children).toBe('Meetio');
  });

  it('bolds every span when the brand name appears twice', () => {
    const renderer = renderSync('Meetio ghi âm. Cảm ơn bạn đã dùng Meetio.');
    expect(boldTextNodes(renderer)).toHaveLength(2);
  });
});
