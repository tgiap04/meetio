import TestRenderer, { act } from 'react-test-renderer';
import { Text, View } from 'react-native';
import { GraphNode } from './graph-node';
import { colors } from '../../theme/colors';

function render(props: Parameters<typeof GraphNode>[0]) {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<GraphNode {...props} />);
  });
  return renderer;
}

describe('GraphNode', () => {
  it('renders the label and the Vietnamese type caption', () => {
    const renderer = render({ node: { id: 'e1', label: 'Nguyễn Văn Anh', type: 'person' }, x: 100, y: 100 });
    const texts = renderer.root.findAllByType(Text).map((t) => t.props.children);
    expect(texts).toContain('Nguyễn Văn Anh');
    expect(texts).toContain('Người');
  });

  it('colours a project node with the solid orange fill and white text', () => {
    const renderer = render({ node: { id: 'p1', label: 'Dự án ABC', type: 'project' }, x: 0, y: 0 });
    const view = renderer.root.findAllByType(View)[0];
    expect(view.props.style).toContainEqual({ backgroundColor: colors.entityProjectFill, left: -74, top: -30 });
    const label = renderer.root.findAllByType(Text)[0];
    expect(label.props.style).toContainEqual({ color: colors.primaryText });
  });

  it('centres the pill on the given x/y', () => {
    const renderer = render({ node: { id: 'e1', label: 'X', type: 'topic' }, x: 200, y: 80 });
    const view = renderer.root.findAllByType(View)[0];
    expect(view.props.style).toContainEqual(expect.objectContaining({ left: 200 - 74, top: 80 - 30 }));
  });
});
