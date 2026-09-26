import TestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import type { QaCitation } from '@meetio/shared';
import { CitationChip } from './citation-chip';

function citation(overrides: Partial<QaCitation> = {}): QaCitation {
  return {
    chunk_id: 'c1',
    meeting_id: 'm1',
    meeting_title: 'Sprint Review',
    meeting_date: '2026-05-03T10:00:00.000Z',
    segment_seq: 12,
    excerpt: 'đã chốt xong API',
    available: true,
    ...overrides,
  };
}

describe('CitationChip', () => {
  let renderer: TestRenderer.ReactTestRenderer | undefined;
  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  it('renders the meeting title and dd/MM date, tappable to onPress', () => {
    const onPress = jest.fn();
    act(() => {
      renderer = TestRenderer.create(<CitationChip citation={citation()} onPress={onPress} />);
    });
    const chip = renderer!.root.findByProps({ testID: 'citation-chip-c1' });
    const text = chip.findByType(Text).props.children.join('');
    expect(text).toContain('Sprint Review');
    expect(text).toContain('03/05');
    act(() => chip.props.onPress());
    expect(onPress).toHaveBeenCalledWith(citation());
  });

  it('renders a disabled notice with no tap handler when the passage no longer exists', () => {
    const onPress = jest.fn();
    act(() => {
      renderer = TestRenderer.create(<CitationChip citation={citation({ available: false })} onPress={onPress} />);
    });
    const chip = renderer!.root.findByProps({ testID: 'citation-chip-c1' });
    expect(chip.props.onPress).toBeUndefined();
    expect(chip.props.children.join('')).toContain('đã thay đổi');
  });
});
