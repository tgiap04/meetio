import TestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import type { EntityRelation } from '@meetio/shared';
import { EntityRelationsList } from './entity-relations-list';

const OUTGOING: EntityRelation = {
  id: 'r1',
  direction: 'outgoing',
  relationship: 'phụ trách',
  other: { id: 'api', canonical_name: 'API', type: 'topic' },
  confidence: 0.9,
  meeting_id: 'm1',
  meeting_title: 'Sprint Review',
  chunk_id: 'c1',
  segment_seq: 12,
};

const INCOMING: EntityRelation = {
  id: 'r2',
  direction: 'incoming',
  relationship: 'phụ trách',
  other: { id: 'lead', canonical_name: 'Lê Thị Mai', type: 'person' },
  confidence: 0.9,
  meeting_id: 'm2',
  meeting_title: 'Standup',
  chunk_id: 'c2',
  segment_seq: 4,
};

function render(relations: readonly EntityRelation[], onRelationPress = jest.fn()) {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <EntityRelationsList
        entityName="Nguyễn Văn Anh"
        entityType="person"
        onRelationPress={onRelationPress}
        relations={relations}
      />,
    );
  });
  return renderer;
}

function allTexts(renderer: TestRenderer.ReactTestRenderer) {
  return renderer.root.findAllByType(Text).map((t) => t.props.children).flat();
}

describe('EntityRelationsList', () => {
  it('renders nothing when there are no relations', () => {
    const renderer = render([]);
    expect(renderer.toJSON()).toBeNull();
  });

  it('puts this entity as the subject for an outgoing relation', () => {
    const renderer = render([OUTGOING]);
    const texts = allTexts(renderer);
    expect(texts).toContain('Nguyễn Văn Anh');
    expect(texts).toContain('API');
    expect(texts.join('')).toContain('phụ trách');
  });

  it('puts this entity as the object for an incoming relation', () => {
    const renderer = render([INCOMING]);
    const texts = allTexts(renderer);
    expect(texts).toContain('Lê Thị Mai');
    expect(texts).toContain('Nguyễn Văn Anh');
  });

  it('tapping a row calls onRelationPress with that relation', () => {
    const onRelationPress = jest.fn();
    const renderer = render([OUTGOING], onRelationPress);
    act(() => {
      renderer.root.findByProps({ accessibilityRole: 'button' }).props.onPress();
    });
    expect(onRelationPress).toHaveBeenCalledWith(OUTGOING);
  });

  it('shows the citing meeting title on each row', () => {
    const renderer = render([OUTGOING]);
    expect(allTexts(renderer)).toContain('Sprint Review');
  });
});
