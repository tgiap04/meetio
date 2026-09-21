import TestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { TranscriptList } from './transcript-list';
import { TRANSCRIPT_LINES } from '../../mocks/transcript.mock';

function render(lines: typeof TRANSCRIPT_LINES) {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<TranscriptList lines={lines} />);
  });
  return renderer;
}

describe('TranscriptList', () => {
  it('renders every given line', () => {
    const renderer = render(TRANSCRIPT_LINES);
    const texts = renderer.root.findAllByType(Text).map((node) => node.props.children).flat().join('|');
    for (const line of TRANSCRIPT_LINES) {
      expect(texts).toContain(line.speaker);
      expect(texts).toContain(line.timestamp);
    }
  });

  it('renders EmptyState when given no lines', () => {
    const renderer = render([]);
    expect(renderer.root.findByProps({ testID: 'empty-state' })).toBeTruthy();
  });
});
