import TestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import type { EntityDetail } from '@meetio/shared';
import { EntityHeaderCard } from './entity-header-card';

function entity(overrides: Partial<EntityDetail> = {}): EntityDetail {
  return {
    id: 'e1',
    canonical_name: 'Nguyễn Văn Anh',
    type: 'person',
    aliases: [],
    mention_count: 3,
    meeting_count: 1,
    last_mentioned_at: null,
    description: null,
    is_user_edited: false,
    relations: [],
    meetings: [],
    merges: [],
    ...overrides,
  };
}

function render(props: Partial<EntityDetail> = {}, onEditPress = jest.fn(), onDeletePress = jest.fn()) {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <EntityHeaderCard entity={entity(props)} onDeletePress={onDeletePress} onEditPress={onEditPress} />,
    );
  });
  return renderer;
}

describe('EntityHeaderCard', () => {
  it('renders the name and Vietnamese type label', () => {
    const renderer = render();
    const texts = renderer.root.findAllByType(Text).map((t) => t.props.children).flat();
    expect(texts).toContain('Nguyễn Văn Anh');
    expect(texts).toContain('Người');
  });

  it('renders aliases only when present', () => {
    const withAliases = render({ aliases: ['Anh', 'A.Nguyen'] });
    expect(withAliases.root.findAllByType(Text).map((t) => t.props.children).flat().join(' ')).toContain(
      'Còn gọi là: Anh, A.Nguyen',
    );
    const withoutAliases = render();
    expect(withoutAliases.root.findAllByType(Text).map((t) => t.props.children).flat().join(' ')).not.toContain(
      'Còn gọi là',
    );
  });

  it('tapping edit calls onEditPress', () => {
    const onEditPress = jest.fn();
    const renderer = render({}, onEditPress);
    act(() => renderer.root.findByProps({ accessibilityLabel: 'Sửa thực thể' }).props.onPress());
    expect(onEditPress).toHaveBeenCalled();
  });

  it('tapping delete calls onDeletePress', () => {
    const onDeletePress = jest.fn();
    const renderer = render({}, jest.fn(), onDeletePress);
    act(() => renderer.root.findByProps({ accessibilityLabel: 'Xóa thực thể' }).props.onPress());
    expect(onDeletePress).toHaveBeenCalled();
  });
});
