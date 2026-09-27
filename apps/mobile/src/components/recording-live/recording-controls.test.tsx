import TestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { RecordingControls } from './recording-controls';

describe('RecordingControls', () => {
  function render(props: Partial<Parameters<typeof RecordingControls>[0]> = {}) {
    const onPauseToggle = jest.fn();
    const onEnd = jest.fn();
    const merged = {
      paused: false,
      onPauseToggle,
      onEnd,
      ...props,
    };

    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<RecordingControls {...merged} />);
    });

    return { renderer, onPauseToggle, onEnd };
  }

  describe('rendering', () => {
    it('renders the pause/resume button with mic icon when paused', () => {
      const { renderer } = render({ paused: true });
      const button = renderer.root.findByProps({ testID: 'recording-pause-button' });
      expect(button).toBeDefined();
      expect(button.props.accessibilityLabel).toBe('Tiếp tục ghi âm');
    });

    it('renders the pause/resume button with pause icon when recording', () => {
      const { renderer } = render({ paused: false });
      const button = renderer.root.findByProps({ testID: 'recording-pause-button' });
      expect(button.props.accessibilityLabel).toBe('Tạm dừng ghi âm');
    });

    it('renders the end button', () => {
      const { renderer } = render();
      const button = renderer.root.findByProps({ testID: 'recording-end-button' });
      expect(button).toBeDefined();
      expect(button.props.accessibilityLabel).toBe('Kết thúc cuộc họp');
    });

    it('shows "Kết thúc" label beside the end button', () => {
      const { renderer } = render();
      const texts = renderer.root.findAllByType(Text).map((n) => n.props.children);
      expect(texts).toContain('Kết thúc');
    });
  });

  describe('pause toggle', () => {
    it('calls onPauseToggle when pause button is pressed', () => {
      const { renderer, onPauseToggle } = render();
      const button = renderer.root.findByProps({ testID: 'recording-pause-button' });

      act(() => {
        button.props.onPress();
      });

      expect(onPauseToggle).toHaveBeenCalledTimes(1);
    });

    it('calls onEnd when end button is pressed', () => {
      const { renderer, onEnd } = render();
      const button = renderer.root.findByProps({ testID: 'recording-end-button' });

      act(() => {
        button.props.onPress();
      });

      expect(onEnd).toHaveBeenCalledTimes(1);
    });
  });

  describe('busy state', () => {
    it('disables buttons when busy is true', () => {
      const { renderer } = render({ busy: true });
      const pauseButton = renderer.root.findByProps({ testID: 'recording-pause-button' });
      const endButton = renderer.root.findByProps({ testID: 'recording-end-button' });

      expect(pauseButton.props.disabled).toBe(true);
      expect(endButton.props.disabled).toBe(true);
    });

    it('enables buttons when busy is false', () => {
      const { renderer } = render({ busy: false });
      const pauseButton = renderer.root.findByProps({ testID: 'recording-pause-button' });
      const endButton = renderer.root.findByProps({ testID: 'recording-end-button' });

      expect(pauseButton.props.disabled).toBe(false);
      expect(endButton.props.disabled).toBe(false);
    });

    it('sets disabled prop when busy', () => {
      // test-renderer doesn't prevent onPress when disabled=true by default,
      // so we just test that the disabled prop is set correctly
      const { renderer } = render({ busy: true });
      const button = renderer.root.findByProps({ testID: 'recording-pause-button' });
      expect(button.props.disabled).toBe(true);
    });
  });

  describe('accessibility', () => {
    it('sets accessibility role to button', () => {
      const { renderer } = render();
      const pauseButton = renderer.root.findByProps({ testID: 'recording-pause-button' });
      const endButton = renderer.root.findByProps({ testID: 'recording-end-button' });

      expect(pauseButton.props.accessibilityRole).toBe('button');
      expect(endButton.props.accessibilityRole).toBe('button');
    });

    it('updates accessibility labels based on paused state', () => {
      const { renderer: paused } = render({ paused: true });
      const { renderer: recording } = render({ paused: false });

      const pausedLabel = paused.root.findByProps({ testID: 'recording-pause-button' }).props.accessibilityLabel;
      const recordingLabel = recording.root.findByProps({ testID: 'recording-pause-button' }).props.accessibilityLabel;

      expect(pausedLabel).toBe('Tiếp tục ghi âm');
      expect(recordingLabel).toBe('Tạm dừng ghi âm');
    });

    it('sets accessibility state disabled when busy', () => {
      const { renderer } = render({ busy: true });
      const pauseButton = renderer.root.findByProps({ testID: 'recording-pause-button' });

      expect(pauseButton.props.accessibilityState.disabled).toBe(true);
    });
  });
});
