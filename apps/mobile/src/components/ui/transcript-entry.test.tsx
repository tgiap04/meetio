import TestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { TranscriptEntry } from './transcript-entry';

function render(props: Parameters<typeof TranscriptEntry>[0]) {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<TranscriptEntry {...props} />);
  });
  return renderer;
}

describe('TranscriptEntry', () => {
  it('renders timestamp and text', () => {
    const renderer = render({
      variant: 'review',
      timestamp: '00:02',
      text: 'Hôm nay chúng ta sẽ tập trung vào phần API.',
    });
    const texts = renderer.root.findAllByType(Text).map((n) => n.props.children);
    expect(texts).toEqual(['00:02', 'Hôm nay chúng ta sẽ tập trung vào phần API.']);
  });

  it('renders no speaker name or avatar initials', () => {
    const renderer = render({
      variant: 'review',
      timestamp: '00:02',
      text: 'Hôm nay chúng ta sẽ tập trung vào phần API.',
    });
    const texts = renderer.root.findAllByType(Text).map((n) => n.props.children);
    expect(texts).not.toContain('Nguyễn Văn Anh');
    expect(texts).not.toContain('NA');
  });

  it('renders the translation block when given', () => {
    const renderer = render({
      variant: 'live',
      timestamp: '00:02',
      text: 'Hôm nay chúng ta sẽ tập trung vào phần API.',
      translation: 'Today we will focus on the API.',
    });
    const texts = renderer.root.findAllByType(Text).map((n) => n.props.children);
    expect(texts).toContain('Today we will focus on the API.');
  });

  it('omits the translation block when none is given', () => {
    const renderer = render({
      variant: 'review',
      timestamp: '00:16',
      text: 'Phần backend hiện tại đã hoàn thành khoảng 70%.',
    });
    expect(renderer.root.findAllByType(Text)).toHaveLength(2);
  });
});
