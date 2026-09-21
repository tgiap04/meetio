import TestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { AiProcessingNotice } from './ai-processing-notice';
import { AppIcon } from '../icons/app-icon';

function render() {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<AiProcessingNotice />);
  });
  return renderer;
}

describe('AiProcessingNotice', () => {
  it('renders the heading verbatim from the crop', () => {
    const renderer = render();
    const texts = renderer.root.findAllByType(Text).map((node) => node.props.children);
    expect(texts).toContain('Đang xử lý bằng AI');
  });

  it('renders the two-line body promising analysis and (never-sent) notification', () => {
    const renderer = render();
    const texts = renderer.root.findAllByType(Text).map((node) => node.props.children);
    const flattened = texts.flat().join('');
    expect(flattened).toContain('Chúng tôi đang phân tích nội dung cuộc họp');
    expect(flattened).toContain('chúng tôi sẽ thông báo khi hoàn tất');
  });

  it('draws the sparkle icon in the header', () => {
    const renderer = render();
    expect(renderer.root.findByType(AppIcon).props.name).toBe('sparkle');
  });
});
