import TestRenderer, { act } from 'react-test-renderer';
import { View } from 'react-native';
import { GraphEdge } from './graph-edge';

function render(props: Partial<React.ComponentProps<typeof GraphEdge>> = {}) {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <GraphEdge
        canvasSize={{ width: 100, height: 100 }}
        color="#1A3570"
        from={{ x: 0, y: 0.5 }}
        to={{ x: 1, y: 0.5 }}
        testID="edge-under-test"
        {...props}
      />,
    );
  });
  return renderer;
}

function findEdgeView(renderer: TestRenderer.ReactTestRenderer) {
  return renderer.root.findByType(View);
}

describe('GraphEdge', () => {
  it('renders a single View sized to the geometry length and rotated', () => {
    const renderer = render();
    const view = findEdgeView(renderer);
    expect(view.props.style.width).toBe(100);
    expect(view.props.style.transform).toEqual([{ rotate: '0deg' }]);
  });

  it('applies the given color as the fill', () => {
    const renderer = render({ color: '#0F5C36' });
    const view = findEdgeView(renderer);
    expect(view.props.style.backgroundColor).toBe('#0F5C36');
  });

  it('rotates 90deg for a vertical pair', () => {
    const renderer = render({ from: { x: 0.5, y: 0 }, to: { x: 0.5, y: 1 } });
    const view = findEdgeView(renderer);
    expect(view.props.style.transform).toEqual([{ rotate: '90deg' }]);
  });
});
