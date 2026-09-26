import TestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import type { MeetingGraphEdge, MeetingGraphNode } from '@meetio/shared';
import { RelationList, type RelationListProps } from './relation-list';

const NODES: readonly MeetingGraphNode[] = [
  { id: 'anh', canonical_name: 'Nguyễn Văn Anh', type: 'person', mention_count: 3 },
  { id: 'api', canonical_name: 'API', type: 'topic', mention_count: 2 },
];

const RELATIONS: readonly MeetingGraphEdge[] = [
  { source_id: 'anh', target_id: 'api', relationship: 'phụ trách', count: 1, chunk_id: 'c1', segment_seq: 12 },
];

function render(props: RelationListProps) {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<RelationList {...props} />);
  });
  return renderer;
}

function allTexts(renderer: TestRenderer.ReactTestRenderer) {
  return renderer.root.findAllByType(Text).map((t) => t.props.children).flat();
}

describe('RelationList', () => {
  it('renders the subject → verb → object sentence', () => {
    const renderer = render({ nodes: NODES, onRelationPress: jest.fn(), onViewDetailsPress: jest.fn(), relations: RELATIONS });
    expect(allTexts(renderer).join('')).toContain('phụ trách');
  });

  it('tapping a row calls onRelationPress with that edge', () => {
    const onRelationPress = jest.fn();
    const renderer = render({ nodes: NODES, onRelationPress, onViewDetailsPress: jest.fn(), relations: RELATIONS });
    const row = renderer.root
      .findAll((n) => n.props.accessibilityRole === 'button' && typeof n.props.onPress === 'function')
      .find((n) => n.findAllByType(Text).some((t) => String(t.props.children).includes('phụ trách')));
    act(() => {
      row?.props.onPress();
    });
    expect(onRelationPress).toHaveBeenCalledWith(RELATIONS[0]);
  });

  it('tapping "Xem chi tiết" calls onViewDetailsPress', () => {
    const onViewDetailsPress = jest.fn();
    const renderer = render({ nodes: NODES, onRelationPress: jest.fn(), onViewDetailsPress, relations: RELATIONS });
    const buttons = renderer.root.findAll(
      (n) => n.props.accessibilityRole === 'button' && typeof n.props.onPress === 'function',
    );
    act(() => {
      buttons[buttons.length - 1].props.onPress();
    });
    expect(onViewDetailsPress).toHaveBeenCalled();
  });

  it('shows an empty message when there are no relations', () => {
    const renderer = render({ nodes: [], onRelationPress: jest.fn(), onViewDetailsPress: jest.fn(), relations: [] });
    expect(allTexts(renderer).join(' ')).toContain('Chưa có quan hệ nào');
  });
});
