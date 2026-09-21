import TestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { RecordingDoneHero } from './recording-done-hero';

function render() {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<RecordingDoneHero />);
  });
  return renderer;
}

describe('RecordingDoneHero', () => {
  it('renders the confirmation title verbatim from the crop', () => {
    const renderer = render();
    const texts = renderer.root.findAllByType(Text).map((node) => node.props.children);
    expect(texts).toContain('Đã ghi âm xong!');
  });

  it('renders the recording duration verbatim from the crop', () => {
    const renderer = render();
    const texts = renderer.root.findAllByType(Text).map((node) => node.props.children);
    expect(texts).toContain('42 phút 18 giây');
  });

  it('renders the word count verbatim from the crop', () => {
    const renderer = render();
    const texts = renderer.root.findAllByType(Text).map((node) => node.props.children);
    expect(texts).toContain('1.284 từ đã được ghi nhận');
  });
});
