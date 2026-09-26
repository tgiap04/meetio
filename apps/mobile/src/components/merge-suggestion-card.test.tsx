import TestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import type { MergeSuggestion } from '@meetio/shared';
import { MergeSuggestionCard } from './merge-suggestion-card';

const SUGGESTION: MergeSuggestion = {
  id: 's1',
  score: 0.92,
  a: { id: 'e1', canonical_name: 'Nguyễn Văn Anh', type: 'person', aliases: [], mention_count: 3, meeting_count: 1, last_mentioned_at: null },
  b: { id: 'e2', canonical_name: 'Anh Nguyễn', type: 'person', aliases: [], mention_count: 1, meeting_count: 1, last_mentioned_at: null },
};

function render(onMergePress = jest.fn(), onRejectPress = jest.fn()) {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <MergeSuggestionCard onMergePress={onMergePress} onRejectPress={onRejectPress} suggestion={SUGGESTION} />,
    );
  });
  return renderer;
}

function allTexts(renderer: TestRenderer.ReactTestRenderer) {
  return renderer.root.findAllByType(Text).map((t) => t.props.children).flat();
}

describe('MergeSuggestionCard', () => {
  it('renders both entity names and the rounded score', () => {
    const renderer = render();
    const texts = allTexts(renderer);
    expect(texts).toContain('Nguyễn Văn Anh');
    expect(texts).toContain('Anh Nguyễn');
    expect(texts).toContain('Độ giống: 92%');
  });

  it('tapping the first column keeps "a" and merges "b" away', () => {
    const onMergePress = jest.fn();
    const renderer = render(onMergePress);
    const column = renderer.root
      .findAll((n) => n.props.accessibilityRole === 'button' && typeof n.props.onPress === 'function')
      .find((n) => n.findAllByType(Text).some((t) => t.props.children === 'Nguyễn Văn Anh'));
    act(() => column?.props.onPress());
    expect(onMergePress).toHaveBeenCalledWith(SUGGESTION.a, SUGGESTION.b);
  });

  it('tapping the second column keeps "b" and merges "a" away', () => {
    const onMergePress = jest.fn();
    const renderer = render(onMergePress);
    const column = renderer.root
      .findAll((n) => n.props.accessibilityRole === 'button' && typeof n.props.onPress === 'function')
      .find((n) => n.findAllByType(Text).some((t) => t.props.children === 'Anh Nguyễn'));
    act(() => column?.props.onPress());
    expect(onMergePress).toHaveBeenCalledWith(SUGGESTION.b, SUGGESTION.a);
  });

  it('tapping "Không trùng" calls onRejectPress', () => {
    const onRejectPress = jest.fn();
    const renderer = render(jest.fn(), onRejectPress);
    const button = renderer.root
      .findAll((n) => n.props.accessibilityRole === 'button' && typeof n.props.onPress === 'function')
      .find((n) => n.findAllByType(Text).some((t) => t.props.children === 'Không trùng'));
    act(() => button?.props.onPress());
    expect(onRejectPress).toHaveBeenCalled();
  });
});
