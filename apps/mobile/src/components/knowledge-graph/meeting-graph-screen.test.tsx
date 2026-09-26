import TestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import MeetingGraphScreen from '../../../app/(app)/meeting-graph';
import { GraphNode } from './graph-node';
import { ENTITIES_LIST_ROUTE, MEETING_TRANSCRIPT_ROUTE } from '../../navigation/app-routes';

const mockBack = jest.fn();
const mockPush = jest.fn();
let mockParams: { id?: string } = { id: 'm1' };

jest.mock('expo-router', () => ({
  router: { back: (...args: unknown[]) => mockBack(...args), push: (...args: unknown[]) => mockPush(...args) },
  useLocalSearchParams: () => mockParams,
}));

const mockUseMeetingGraphQuery = jest.fn();
jest.mock('../../hooks/use-meeting-graph-query', () => ({
  useMeetingGraphQuery: (...args: unknown[]) => mockUseMeetingGraphQuery(...args),
}));

const NODES = [
  { id: 'du-an-abc', canonical_name: 'Dự án ABC', type: 'project', mention_count: 9 },
  { id: 'anh', canonical_name: 'Nguyễn Văn Anh', type: 'person', mention_count: 3 },
  { id: 'api', canonical_name: 'API', type: 'topic', mention_count: 2 },
];

const EDGES = [
  { source_id: 'anh', target_id: 'api', relationship: 'phụ trách', count: 1, chunk_id: 'c1', segment_seq: 12 },
];

function mockPending() {
  mockUseMeetingGraphQuery.mockReturnValue({ isPending: true, isError: false, data: undefined, refetch: jest.fn() });
}

function mockSuccess(nodes: typeof NODES, edges: typeof EDGES) {
  mockUseMeetingGraphQuery.mockReturnValue({
    isPending: false,
    isError: false,
    data: { nodes, edges },
    refetch: jest.fn(),
  });
}

function mockError(refetch = jest.fn()) {
  const error = Object.assign(new Error('boom'), { isAxiosError: true, response: { data: {} } });
  mockUseMeetingGraphQuery.mockReturnValue({ isPending: false, isError: true, error, data: undefined, refetch });
  return refetch;
}

function render() {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<MeetingGraphScreen />);
  });
  const canvas = renderer.root.findAllByProps({ testID: 'graph-canvas' })[0];
  if (canvas) {
    act(() => {
      canvas.props.onLayout({ nativeEvent: { layout: { width: 320, height: 460 } } });
    });
  }
  return renderer;
}

function allText(renderer: TestRenderer.ReactTestRenderer) {
  return renderer.root.findAllByType(Text).map((node) => node.props.children).flat().join(' ');
}

function findChip(renderer: TestRenderer.ReactTestRenderer, label: string) {
  return renderer.root
    .findAll((node) => node.props.accessibilityRole === 'button' && typeof node.props.onPress === 'function')
    .find((node) => node.findAllByType(Text).some((t) => t.props.children === label));
}

describe('MeetingGraphScreen', () => {
  beforeEach(() => {
    mockBack.mockClear();
    mockPush.mockClear();
    mockParams = { id: 'm1' };
  });

  it('renders the header title', () => {
    mockSuccess(NODES, EDGES);
    const renderer = render();
    expect(allText(renderer)).toContain('Knowledge Graph');
  });

  it('shows a loading state while pending', () => {
    mockPending();
    const renderer = render();
    expect(renderer.root.findByProps({ testID: 'loading-state' })).toBeTruthy();
  });

  it('shows an error state with retry on failure', () => {
    const refetch = mockError();
    const renderer = render();
    act(() => renderer.root.findByProps({ testID: 'error-state-retry' }).props.onPress());
    expect(refetch).toHaveBeenCalled();
  });

  it('shows an empty state when the meeting has no entities', () => {
    mockSuccess([], []);
    const renderer = render();
    expect(allText(renderer)).toContain('Chưa có dữ liệu sơ đồ tri thức');
  });

  it('renders all three nodes under "Tất cả"', () => {
    mockSuccess(NODES, EDGES);
    const renderer = render();
    expect(renderer.root.findAllByType(GraphNode)).toHaveLength(3);
  });

  it('filters the diagram down when a type chip is tapped', () => {
    mockSuccess(NODES, EDGES);
    const renderer = render();
    act(() => {
      findChip(renderer, 'Người')?.props.onPress();
    });
    expect(renderer.root.findAllByType(GraphNode)).toHaveLength(1);
  });

  it('tapping a relation row pushes the transcript at its segment_seq', () => {
    mockSuccess(NODES, EDGES);
    const renderer = render();
    const relationRow = renderer.root
      .findAll((n) => n.props.accessibilityRole === 'button' && typeof n.props.onPress === 'function')
      .find((n) => n.findAllByType(Text).some((t) => String(t.props.children).includes('phụ trách')));
    act(() => {
      relationRow?.props.onPress();
    });
    expect(mockPush).toHaveBeenCalledWith({
      pathname: MEETING_TRANSCRIPT_ROUTE,
      params: { id: 'm1', seq: '12' },
    });
  });

  it('tapping "Xem chi tiết" pushes the entity list', () => {
    mockSuccess(NODES, EDGES);
    const renderer = render();
    const link = renderer.root
      .findAll((n) => n.props.accessibilityRole === 'button' && typeof n.props.onPress === 'function')
      .find((n) => n.findAllByType(Text).some((t) => t.props.children === 'Xem chi tiết'));
    act(() => {
      link?.props.onPress();
    });
    expect(mockPush).toHaveBeenCalledWith(ENTITIES_LIST_ROUTE);
  });

  it('renders an error state and calls router.back when no id param is present', () => {
    mockParams = {};
    mockSuccess(NODES, EDGES);
    const renderer = render();
    act(() => renderer.root.findByProps({ testID: 'error-state-retry' }).props.onPress());
    expect(mockBack).toHaveBeenCalled();
  });
});
