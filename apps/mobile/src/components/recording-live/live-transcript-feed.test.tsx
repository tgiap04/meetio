import TestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { LiveTranscriptFeed } from './live-transcript-feed';
import { TRANSCRIPT_LINES } from '../../mocks';

function renderFeed(language: 'vi' | 'en') {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<LiveTranscriptFeed language={language} />);
  });
  return renderer;
}

function flatTexts(renderer: TestRenderer.ReactTestRenderer) {
  return renderer.root
    .findAllByType(Text)
    .map((node) => node.props.children)
    .flat()
    .join(' ');
}

describe('LiveTranscriptFeed', () => {
  it('renders every fixture line', () => {
    const renderer = renderFeed('vi');
    const flattened = flatTexts(renderer);
    for (const line of TRANSCRIPT_LINES) {
      expect(flattened).toContain(line.text);
    }
  });

  it('shows the Vietnamese text and the translation card on Tiếng Việt', () => {
    const renderer = renderFeed('vi');
    const flattened = flatTexts(renderer);
    expect(flattened).toContain(TRANSCRIPT_LINES[0].text);
    expect(flattened).toContain(TRANSCRIPT_LINES[0].translation);
  });

  it('shows the translation as the primary line on Tiếng Anh', () => {
    const renderer = renderFeed('en');
    const flattened = flatTexts(renderer);
    expect(flattened).toContain(TRANSCRIPT_LINES[0].translation);
  });

  it('falls back to Vietnamese text with a muted note for lines with no translation on Tiếng Anh', () => {
    const renderer = renderFeed('en');
    const flattened = flatTexts(renderer);
    expect(flattened).toContain(TRANSCRIPT_LINES[1].text);
    expect(flattened).toContain('Chưa có bản dịch');
  });
});
