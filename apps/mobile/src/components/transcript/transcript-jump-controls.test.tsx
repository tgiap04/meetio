import TestRenderer, { act } from 'react-test-renderer';
import { TranscriptJumpControls } from './transcript-jump-controls';

function render(props: Partial<Parameters<typeof TranscriptJumpControls>[0]> = {}) {
  const merged = {
    onScrollToTop: jest.fn(),
    onScrollToBottom: jest.fn(),
    onJumpToLastRead: jest.fn(),
    ...props,
  };
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<TranscriptJumpControls {...merged} />);
  });
  return { renderer, ...merged };
}

describe('TranscriptJumpControls', () => {
  it('fires onScrollToTop when "Đầu" is tapped', () => {
    const { renderer, onScrollToTop } = render();
    act(() => renderer.root.findByProps({ testID: 'transcript-jump-top' }).props.onPress());
    expect(onScrollToTop).toHaveBeenCalledTimes(1);
  });

  it('fires onScrollToBottom when "Cuối" is tapped', () => {
    const { renderer, onScrollToBottom } = render();
    act(() => renderer.root.findByProps({ testID: 'transcript-jump-bottom' }).props.onPress());
    expect(onScrollToBottom).toHaveBeenCalledTimes(1);
  });

  it('fires onJumpToLastRead when "Gần đây" is tapped', () => {
    const { renderer, onJumpToLastRead } = render();
    act(() => renderer.root.findByProps({ testID: 'transcript-jump-last-read' }).props.onPress());
    expect(onJumpToLastRead).toHaveBeenCalledTimes(1);
  });
});
