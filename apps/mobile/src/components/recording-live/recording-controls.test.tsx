import TestRenderer, { act } from 'react-test-renderer';
import { RecordingControls } from './recording-controls';

function renderControls(overrides: Partial<Parameters<typeof RecordingControls>[0]> = {}) {
  const onPausePress = jest.fn();
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<RecordingControls onPausePress={onPausePress} {...overrides} />);
  });
  return { renderer, onPausePress };
}

describe('RecordingControls', () => {
  it('calls onPausePress when the centre button is pressed', () => {
    const { renderer, onPausePress } = renderControls();
    act(() => {
      renderer.root.findByProps({ testID: 'recording-pause-button' }).props.onPress();
    });
    expect(onPausePress).toHaveBeenCalledTimes(1);
  });

  it('calls the optional camera handler when provided', () => {
    const onCameraPress = jest.fn();
    const { renderer } = renderControls({ onCameraPress });
    act(() => {
      renderer.root.findByProps({ testID: 'recording-camera-button' }).props.onPress();
    });
    expect(onCameraPress).toHaveBeenCalledTimes(1);
  });

  it('calls the optional bookmark handler when provided', () => {
    const onBookmarkPress = jest.fn();
    const { renderer } = renderControls({ onBookmarkPress });
    act(() => {
      renderer.root.findByProps({ testID: 'recording-bookmark-button' }).props.onPress();
    });
    expect(onBookmarkPress).toHaveBeenCalledTimes(1);
  });

  it('renders the halo ring behind the pause button', () => {
    const { renderer } = renderControls();
    const centre = renderer.root.findByProps({ testID: 'recording-pause-button' }).parent!;
    expect(centre.children.length).toBeGreaterThanOrEqual(2);
  });
});
