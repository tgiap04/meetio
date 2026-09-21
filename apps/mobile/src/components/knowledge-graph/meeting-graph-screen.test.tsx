import TestRenderer, { act } from 'react-test-renderer';
import { Text, View } from 'react-native';
import MeetingGraphScreen from '../../../app/(app)/meeting-graph';
import { GraphNode } from './graph-node';

const mockBack = jest.fn();

jest.mock('expo-router', () => ({
  router: { back: (...args: unknown[]) => mockBack(...args) },
  // P13 tap audit added the `?id=` read for parity with screen 09 — stubbed
  // here the same way meeting-detail's own tests stub the hook.
  useLocalSearchParams: () => ({}),
}));

function render() {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<MeetingGraphScreen />);
  });
  const canvas = renderer.root.findByProps({ testID: 'graph-canvas' });
  act(() => {
    canvas.props.onLayout({ nativeEvent: { layout: { width: 320, height: 460 } } });
  });
  return renderer;
}

function allText(renderer: TestRenderer.ReactTestRenderer) {
  return renderer.root
    .findAllByType(Text)
    .map((node) => node.props.children)
    .flat()
    .join(' ');
}

function findChip(renderer: TestRenderer.ReactTestRenderer, label: string) {
  const labelNode = renderer.root.findAll((node) => node.type === Text && node.props.children === label)[0];
  let candidate = labelNode.parent;
  while (candidate && typeof candidate.props.onPress !== 'function') {
    candidate = candidate.parent;
  }
  if (!candidate) {
    throw new Error(`No pressable ancestor found for chip "${label}"`);
  }
  return candidate;
}

describe('MeetingGraphScreen', () => {
  beforeEach(() => mockBack.mockClear());

  it('renders the header title and calls router.back from the chevron', () => {
    const renderer = render();
    expect(allText(renderer)).toContain('Knowledge Graph');
    const backButton = renderer.root.findByProps({ accessibilityLabel: 'Quay lại' });
    act(() => {
      backButton.props.onPress();
    });
    expect(mockBack).toHaveBeenCalled();
  });

  it('shows all five nodes by default under "Tất cả"', () => {
    const renderer = render();
    expect(renderer.root.findAllByType(GraphNode)).toHaveLength(5);
  });

  it('filters the diagram down when a type chip is tapped', () => {
    const renderer = render();
    act(() => {
      findChip(renderer, 'Person').props.onPress();
    });
    expect(renderer.root.findAllByType(GraphNode)).toHaveLength(3);
  });

  it('restores all nodes when switching back to "Tất cả"', () => {
    const renderer = render();
    act(() => {
      findChip(renderer, 'Task').props.onPress();
    });
    act(() => {
      findChip(renderer, 'Tất cả').props.onPress();
    });
    expect(renderer.root.findAllByType(GraphNode)).toHaveLength(5);
  });

  it('renders the relation list rows', () => {
    const renderer = render();
    expect(allText(renderer)).toContain('phụ trách');
  });

  it('renders "Xem chi tiết" with no navigation wired', () => {
    const renderer = render();
    expect(allText(renderer)).toContain('Xem chi tiết');
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('renders the canvas as a plain View before it has measured', () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<MeetingGraphScreen />);
    });
    expect(renderer.root.findByProps({ testID: 'graph-canvas' }).type).toBe(View);
  });
});
