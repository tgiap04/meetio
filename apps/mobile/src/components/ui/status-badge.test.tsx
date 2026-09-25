import TestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { StatusBadge } from './status-badge';

function render(props: Parameters<typeof StatusBadge>[0]) {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<StatusBadge {...props} />);
  });
  return renderer;
}

describe('StatusBadge', () => {
  it('shows the default Vietnamese label for "done"', () => {
    const renderer = render({ status: 'done' });
    expect(renderer.root.findByType(Text).props.children).toBe('Đã xử lý');
  });

  it('shows the default Vietnamese label for "processing"', () => {
    const renderer = render({ status: 'processing' });
    expect(renderer.root.findByType(Text).props.children).toBe('Đang xử lý');
  });

  it('shows the default Vietnamese label for "queued"', () => {
    const renderer = render({ status: 'queued' });
    expect(renderer.root.findByType(Text).props.children).toBe('Chờ xử lý');
  });

  it('shows the default Vietnamese label for "failed"', () => {
    const renderer = render({ status: 'failed' });
    expect(renderer.root.findByType(Text).props.children).toBe('Thất bại');
  });

  it('lets the caller override the label', () => {
    const renderer = render({ status: 'done', label: 'Hoàn thành' });
    expect(renderer.root.findByType(Text).props.children).toBe('Hoàn thành');
  });
});
