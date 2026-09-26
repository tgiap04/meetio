import TestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { EntitiesListHeader } from './entities-list-header';

function render(mergeSuggestionCount: number, onMergeSuggestionsPress = jest.fn()) {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <EntitiesListHeader
        activeChip="all"
        mergeSuggestionCount={mergeSuggestionCount}
        onBack={jest.fn()}
        onChipChange={jest.fn()}
        onMergeSuggestionsPress={onMergeSuggestionsPress}
        onQueryTextChange={jest.fn()}
        queryText=""
      />,
    );
  });
  return renderer;
}

describe('EntitiesListHeader', () => {
  it('renders the title and every type chip', () => {
    const renderer = render(0);
    const texts = renderer.root.findAllByType(Text).map((t) => t.props.children).flat();
    expect(texts).toContain('Thực thể');
    for (const label of ['Tất cả', 'Người', 'Dự án', 'Chủ đề', 'Khác']) {
      expect(texts).toContain(label);
    }
  });

  it('hides the merge-suggestions entry when the count is zero', () => {
    const renderer = render(0);
    expect(renderer.root.findAllByProps({ name: 'merge' })).toHaveLength(0);
  });

  it('shows the merge-suggestions entry with the count when there are suggestions', () => {
    const renderer = render(3);
    const texts = renderer.root.findAllByType(Text).map((t) => t.props.children).flat();
    expect(texts.join(' ')).toContain('Xem đề xuất gộp (3)');
  });

  it('tapping the merge-suggestions entry calls the handler', () => {
    const onPress = jest.fn();
    const renderer = render(2, onPress);
    let node = renderer.root.findByProps({ name: 'merge' }).parent;
    while (node && typeof node.props.onPress !== 'function') {
      node = node.parent;
    }
    act(() => {
      node?.props.onPress();
    });
    expect(onPress).toHaveBeenCalled();
  });
});
