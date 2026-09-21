import TestRenderer, { act } from 'react-test-renderer';
import { Text, View } from 'react-native';
import { GraphNode } from './graph-node';
import { colors } from '../../theme/colors';
import type { GraphNode as GraphNodeData } from '../../mocks/types';

const CENTRAL_NODE: GraphNodeData = {
  id: 'du-an-abc',
  label: 'Dự án ABC',
  type: 'project',
  paletteKey: 'orange',
  isCentral: true,
  caption: 'Dự án',
};

const PILL_NODE: GraphNodeData = {
  id: 'nguyen-van-anh',
  label: 'Nguyễn Văn Anh',
  type: 'person',
  paletteKey: 'blue',
  isCentral: false,
};

function render(node: GraphNodeData, diameter?: number) {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<GraphNode diameter={diameter} node={node} x={100} y={80} />);
  });
  return renderer;
}

function texts(renderer: TestRenderer.ReactTestRenderer) {
  return renderer.root.findAllByType(Text).map((t) => t.props.children);
}

/** `style` props here are `StyleSheet.create` arrays, e.g. `[typography.label,
 *  { color }]` — real RN merges these at render time, the test renderer does
 *  not, so tests flatten them the same way `StyleSheet.flatten` would. */
function flattenStyle(style: unknown): Record<string, unknown> {
  if (Array.isArray(style)) {
    return Object.assign({}, ...style.map(flattenStyle));
  }
  return (style as Record<string, unknown>) ?? {};
}

describe('GraphNode', () => {
  it('renders the central node as a circle sized to the given diameter, filled orange with white text', () => {
    const renderer = render(CENTRAL_NODE, 120);
    const circle = renderer.root.findAllByType(View).find((v) => flattenStyle(v.props.style).borderRadius === 60);
    expect(circle).toBeDefined();
    const circleStyle = flattenStyle(circle!.props.style);
    expect(circleStyle.width).toBe(120);
    expect(circleStyle.height).toBe(120);
    expect(circleStyle.backgroundColor).toBe(colors.entityProjectFill);
    expect(texts(renderer)).toContain('Dự án ABC');
  });

  it('renders the central node caption outside the circle on its own connector', () => {
    const renderer = render(CENTRAL_NODE, 120);
    expect(texts(renderer)).toContain('Dự án');
  });

  it('omits the caption row when the central node carries none', () => {
    const renderer = render({ ...CENTRAL_NODE, caption: undefined }, 120);
    expect(texts(renderer)).not.toContain('Dự án');
  });

  it('renders a pill node with its label and type caption in the palette colour', () => {
    const renderer = render(PILL_NODE);
    expect(texts(renderer)).toContain('Nguyễn Văn Anh');
    expect(texts(renderer)).toContain('Person');
    const labelText = renderer.root.findAllByType(Text).find((t) => t.props.children === 'Nguyễn Văn Anh')!;
    expect(flattenStyle(labelText.props.style).color).toBe(colors.entityBlueText);
  });

  it('positions the node centered on the given x/y', () => {
    const renderer = render(PILL_NODE);
    const positioned = renderer.root.findAllByType(View)[0];
    expect(flattenStyle(positioned.props.style).position).toBe('absolute');
  });
});
