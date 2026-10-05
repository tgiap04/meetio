import TestRenderer, { act } from 'react-test-renderer';
import { View } from 'react-native';
import { EDGE_STYLES, GraphEdge, type GraphEdgeProps } from './graph-edge';
import { colors } from '../../theme/colors';

function renderEdgeView(props: Partial<GraphEdgeProps> = {}) {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <GraphEdge emphasis="normal" from={{ x: 0, y: 50 }} to={{ x: 100, y: 50 }} {...props} />,
    );
  });
  return renderer.root.findByType(View);
}

describe('GraphEdge', () => {
  it('renders a View sized to the segment length, centered and rotated', () => {
    const view = renderEdgeView();
    expect(view.props.style).toEqual(
      expect.objectContaining({ width: 100, left: 0, top: 50 - 0.75, transform: [{ rotate: '0deg' }] }),
    );
  });

  it('rotates 90deg for a vertical segment', () => {
    const view = renderEdgeView({ from: { x: 50, y: 0 }, to: { x: 50, y: 100 } });
    expect(view.props.style.transform).toEqual([{ rotate: '90deg' }]);
  });

  it('draws a neutral 1.5pt gray line at rest', () => {
    const view = renderEdgeView();
    expect(view.props.style).toEqual(
      expect.objectContaining({ backgroundColor: colors.textMuted, height: 1.5, opacity: 0.6 }),
    );
  });

  it('draws the selected node’s edges in primary at 2.5pt', () => {
    const view = renderEdgeView({ emphasis: 'active' });
    expect(view.props.style).toEqual(expect.objectContaining({ backgroundColor: colors.primary, height: 2.5 }));
  });

  it('fades unrelated edges while something is selected', () => {
    expect(EDGE_STYLES.dimmed.opacity).toBeLessThan(EDGE_STYLES.normal.opacity);
    expect(renderEdgeView({ emphasis: 'dimmed' }).props.style.opacity).toBe(EDGE_STYLES.dimmed.opacity);
  });
});
