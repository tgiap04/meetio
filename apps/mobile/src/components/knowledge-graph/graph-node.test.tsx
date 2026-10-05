import TestRenderer, { act } from 'react-test-renderer';
import { StyleSheet, Text, View } from 'react-native';
import { GraphNode, buildNodeAccessibilityLabel, type GraphNodeProps } from './graph-node';
import { getGraphPillPalette } from './entity-colors';
import { colors } from '../../theme/colors';

const PERSON = { id: 'e1', label: 'Nguyễn Văn Anh', type: 'person' as const, mentionCount: 3 };

function render(props: Partial<GraphNodeProps> = {}) {
  const onPress = jest.fn();
  const all = { node: PERSON, x: 200, y: 80, emphasis: 'normal', onPress, variant: 'ring', maxWidth: 120, ...props };
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<GraphNode {...(all as GraphNodeProps)} />);
  });
  return { renderer, onPress };
}

function findButton(renderer: TestRenderer.ReactTestRenderer) {
  // The outermost match is the Pressable element itself (style is still a function there).
  return renderer.root.findAll((n) => n.props.accessibilityRole === 'button' && typeof n.props.onPress === 'function')[0];
}

function pressableStyle(renderer: TestRenderer.ReactTestRenderer) {
  return StyleSheet.flatten(findButton(renderer).props.style({ pressed: false }));
}

describe('buildNodeAccessibilityLabel', () => {
  it('reads name, Vietnamese type and mention count', () => {
    expect(buildNodeAccessibilityLabel(PERSON)).toBe('Nguyễn Văn Anh, Người, nhắc 3 lần');
  });
});

describe('GraphNode (ring)', () => {
  it('renders the label and the Vietnamese type caption on one line each', () => {
    const { renderer } = render();
    const texts = renderer.root.findAllByType(Text);
    expect(texts.map((t) => t.props.children)).toEqual(['Nguyễn Văn Anh', 'Người']);
    expect(texts.every((t) => t.props.numberOfLines === 1)).toBe(true);
  });

  it('is an accessible button with the spoken label and selected state', () => {
    const { renderer } = render({ emphasis: 'selected' });
    const pressable = findButton(renderer);
    expect(pressable.props.accessibilityRole).toBe('button');
    expect(pressable.props.accessibilityLabel).toBe('Nguyễn Văn Anh, Người, nhắc 3 lần');
    expect(pressable.props.accessibilityState).toEqual({ selected: true });
  });

  it('calls onPress with its id', () => {
    const { renderer, onPress } = render();
    act(() => findButton(renderer).props.onPress());
    expect(onPress).toHaveBeenCalledWith('e1');
  });

  it('centres its slot on x/y and caps the pill at the slot width, ≥44pt tall', () => {
    const { renderer } = render({ maxWidth: 100 } as Partial<GraphNodeProps>);
    const wrap = StyleSheet.flatten(renderer.root.findAllByType(View)[0].props.style);
    expect(wrap).toEqual(expect.objectContaining({ left: 150, top: 58, width: 100 }));
    const pill = pressableStyle(renderer);
    expect(pill.maxWidth).toBe(100);
    expect(pill.height).toBeGreaterThanOrEqual(44);
    expect(pill.minWidth).toBeGreaterThanOrEqual(44);
  });

  it('uses the pastel pill palette with a 1px type-coloured border', () => {
    const { renderer } = render();
    const palette = getGraphPillPalette('person');
    expect(pressableStyle(renderer)).toEqual(
      expect.objectContaining({ backgroundColor: palette.fill, borderColor: palette.border, borderWidth: 1 }),
    );
  });

  it('fades when dimmed', () => {
    const { renderer } = render({ emphasis: 'dimmed' });
    expect(StyleSheet.flatten(renderer.root.findAllByType(View)[0].props.style).opacity).toBe(0.3);
  });
});

describe('GraphNode (center)', () => {
  it('draws a filled circle of the given diameter with a white, 2-line label', () => {
    const { renderer } = render({ variant: 'center', diameter: 96 } as Partial<GraphNodeProps>);
    const circle = pressableStyle(renderer);
    expect(circle).toEqual(
      expect.objectContaining({ width: 96, height: 96, borderRadius: 48, backgroundColor: colors.primaryStrong }),
    );
    const label = renderer.root.findAllByType(Text)[0];
    expect(label.props.numberOfLines).toBe(2);
    expect(StyleSheet.flatten(label.props.style).color).toBe(colors.primaryText);
  });
});
