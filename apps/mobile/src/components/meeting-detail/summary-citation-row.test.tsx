import TestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import type { SummaryCitation } from '@meetio/shared';
import { SummaryCitationRow } from './summary-citation-row';

const CITATION: SummaryCitation = {
  kind: 'point',
  text: 'Bình nhận phần tài liệu API',
  chunk_ids: ['c1'],
  segment_seq: 12,
};

describe('SummaryCitationRow', () => {
  it('renders the citation text', () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<SummaryCitationRow citation={CITATION} onPress={jest.fn()} />);
    });
    const texts = renderer.root.findAllByType(Text).map((node) => node.props.children).flat().join('');
    expect(texts).toContain('Bình nhận phần tài liệu API');
  });

  it('calls onPress with the citation segment_seq when tapped', () => {
    const onPress = jest.fn();
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<SummaryCitationRow citation={CITATION} onPress={onPress} />);
    });
    act(() => {
      renderer.root.findByProps({ accessibilityRole: 'button' }).props.onPress();
    });
    expect(onPress).toHaveBeenCalledWith(12);
  });
});
