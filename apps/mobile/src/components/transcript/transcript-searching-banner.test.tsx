import TestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { TranscriptSearchingBanner } from './transcript-searching-banner';

describe('TranscriptSearchingBanner', () => {
  it('shows the "searching the whole transcript" copy', () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<TranscriptSearchingBanner />);
    });
    const texts = renderer.root.findAllByType(Text).map((n) => n.props.children);
    expect(texts).toContain('Đang tìm trong toàn bộ transcript…');
  });
});
