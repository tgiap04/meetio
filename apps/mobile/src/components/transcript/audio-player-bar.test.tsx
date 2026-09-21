import TestRenderer, { act } from 'react-test-renderer';
import { AudioPlayerBar } from './audio-player-bar';

function render() {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<AudioPlayerBar />);
  });
  return renderer;
}

function timeLabelText(renderer: TestRenderer.ReactTestRenderer) {
  const label = renderer.root.findByProps({ testID: 'audio-player-time-label' });
  return ([] as unknown[]).concat(label.props.children).join('');
}

describe('AudioPlayerBar', () => {
  it('renders the fixed elapsed/total time label', () => {
    const renderer = render();
    expect(timeLabelText(renderer)).toBe('00:18 / 42:18');
  });

  it('renders all three transport controls', () => {
    const renderer = render();
    expect(renderer.root.findByProps({ testID: 'audio-player-skip-back' })).toBeTruthy();
    expect(renderer.root.findByProps({ testID: 'audio-player-play' })).toBeTruthy();
    expect(renderer.root.findByProps({ testID: 'audio-player-skip-forward' })).toBeTruthy();
  });

  it('flips the play button label when tapped, without simulating playback', () => {
    const renderer = render();
    const playButton = renderer.root.findByProps({ testID: 'audio-player-play' });

    expect(playButton.props.accessibilityLabel).toBe('Phát');

    act(() => {
      playButton.props.onPress();
    });

    expect(playButton.props.accessibilityLabel).toBe('Tạm dừng');

    // The time label never moves — there is no real playback to advance.
    expect(timeLabelText(renderer)).toBe('00:18 / 42:18');
  });
});
