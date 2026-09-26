import TestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import type { EntitySummary } from '@meetio/shared';
import { EntityListRow } from './entity-list-row';

const ENTITY: EntitySummary = {
  id: 'e1',
  canonical_name: 'Nguyễn Văn Anh',
  type: 'person',
  aliases: [],
  mention_count: 5,
  meeting_count: 2,
  last_mentioned_at: null,
};

function render(entity: EntitySummary, onPress: () => void) {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<EntityListRow entity={entity} onPress={onPress} />);
  });
  return renderer;
}

describe('EntityListRow', () => {
  it('renders the name, type label, mention and meeting counts', () => {
    const renderer = render(ENTITY, jest.fn());
    const texts = renderer.root.findAllByType(Text).map((t) => t.props.children);
    expect(texts).toContain('Nguyễn Văn Anh');
    expect(texts.join(' ')).toContain('Người');
    expect(texts.join(' ')).toContain('5 lượt nhắc');
    expect(texts.join(' ')).toContain('2 cuộc họp');
  });

  it('calls onPress when tapped', () => {
    const onPress = jest.fn();
    const renderer = render(ENTITY, onPress);
    act(() => {
      renderer.root.findByProps({ accessibilityRole: 'button' }).props.onPress();
    });
    expect(onPress).toHaveBeenCalled();
  });
});
