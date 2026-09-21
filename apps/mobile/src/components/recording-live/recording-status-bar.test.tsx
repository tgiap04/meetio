import TestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { RecordingStatusBar } from './recording-status-bar';

function renderBar(onClose: () => void) {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<RecordingStatusBar elapsed="00:24:18" onClose={onClose} />);
  });
  return renderer;
}

describe('RecordingStatusBar', () => {
  it('renders the recording label and the elapsed time', () => {
    const renderer = renderBar(jest.fn());
    const texts = renderer.root.findAllByType(Text).map((node) => node.props.children);
    expect(texts).toContain('Đang ghi âm');
    expect(texts).toContain('00:24:18');
  });

  it('calls onClose when the close button is pressed', () => {
    const onClose = jest.fn();
    const renderer = renderBar(onClose);
    act(() => {
      renderer.root.findByProps({ testID: 'recording-close-button' }).props.onPress();
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
