import TestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import type { SearchResultItem } from '@meetio/shared';
import { SemanticResultRow } from './semantic-result-row';

const ITEM: SearchResultItem = {
  chunk_id: 'c1',
  meeting_id: 'm1',
  meeting_title: 'Sprint Review',
  meeting_date: '2026-01-15T09:00:00.000Z',
  excerpt: '...bàn về ngân sách và lịch trình...',
  segment_seq: 12,
  segment_end_seq: 14,
  score: 0.82,
};

function render(item: SearchResultItem, onPress = jest.fn()) {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<SemanticResultRow item={item} onPress={onPress} />);
  });
  return { renderer, onPress };
}

describe('SemanticResultRow', () => {
  it('renders the meeting title, formatted date, and the excerpt', () => {
    const { renderer } = render(ITEM);
    const texts = renderer.root.findAllByType(Text).map((node) => node.props.children).flat();
    expect(texts).toContain('Sprint Review');
    expect(texts.join('')).toContain('15/01/2026');
    expect(texts).toContain('...bàn về ngân sách và lịch trình...');
  });

  it('shows an em dash for meeting_date null (a meeting that never recorded a start)', () => {
    const { renderer } = render({ ...ITEM, meeting_date: null });
    const texts = renderer.root.findAllByType(Text).map((node) => node.props.children).flat();
    expect(texts.join('')).toContain('—');
  });

  it('calls onPress with the meeting id and segment_seq when tapped', () => {
    const { renderer, onPress } = render(ITEM);
    act(() => {
      renderer.root.findByProps({ accessibilityRole: 'button' }).props.onPress();
    });
    expect(onPress).toHaveBeenCalledWith('m1', 12);
  });
});
