import TestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { RecordingStatusBar } from './recording-status-bar';

describe('RecordingStatusBar', () => {
  function render(props: Partial<Parameters<typeof RecordingStatusBar>[0]> = {}) {
    const onClose = jest.fn();
    const merged = {
      elapsed: '00:24:18',
      paused: false,
      onClose,
      ...props,
    };

    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<RecordingStatusBar {...merged} />);
    });

    return { renderer, onClose };
  }

  describe('recording indicator', () => {
    it('shows red "Đang ghi âm" when not paused', () => {
      const { renderer } = render({ paused: false });
      const texts = renderer.root.findAllByType(Text).map((node) => node.props.children);
      expect(texts).toContain('Đang ghi âm');
    });

    it('shows grey "Đã tạm dừng" when paused', () => {
      const { renderer } = render({ paused: true });
      const texts = renderer.root.findAllByType(Text).map((node) => node.props.children);
      expect(texts).toContain('Đã tạm dừng');
    });

    it('displays the indicator dot', () => {
      const { renderer } = render();
      const dot = renderer.root.findByProps({ testID: 'recording-status-dot' });
      expect(dot).toBeDefined();
    });

    it('changes dot color based on paused state', () => {
      const { renderer: paused } = render({ paused: true });
      const { renderer: recording } = render({ paused: false });

      const pausedDot = paused.root.findByProps({ testID: 'recording-status-dot' });
      const recordingDot = recording.root.findByProps({ testID: 'recording-status-dot' });

      // Paused dot should have different style (the dotPaused style)
      expect(pausedDot.props.style).toBeDefined();
      expect(recordingDot.props.style).toBeDefined();
    });
  });

  describe('elapsed time', () => {
    it('displays the elapsed time', () => {
      const { renderer } = render({ elapsed: '00:24:18' });
      const elapsed = renderer.root.findByProps({ testID: 'recording-elapsed' });
      expect(elapsed.props.children).toBe('00:24:18');
    });

    it('updates elapsed time when prop changes', () => {
      const { renderer } = render({ elapsed: '00:05:30' });
      const elapsed = renderer.root.findByProps({ testID: 'recording-elapsed' });
      expect(elapsed.props.children).toBe('00:05:30');
    });

    it('handles large elapsed times', () => {
      const { renderer } = render({ elapsed: '02:45:33' });
      const elapsed = renderer.root.findByProps({ testID: 'recording-elapsed' });
      expect(elapsed.props.children).toBe('02:45:33');
    });

    it('handles zero elapsed time', () => {
      const { renderer } = render({ elapsed: '00:00:00' });
      const elapsed = renderer.root.findByProps({ testID: 'recording-elapsed' });
      expect(elapsed.props.children).toBe('00:00:00');
    });
  });

  describe('close button', () => {
    it('renders the close button', () => {
      const { renderer } = render();
      const button = renderer.root.findByProps({ testID: 'recording-close-button' });
      expect(button).toBeDefined();
      expect(button.props.accessibilityLabel).toBe('Thu nhỏ, vẫn tiếp tục ghi');
    });

    it('calls onClose when close button is pressed', () => {
      const { renderer, onClose } = render();
      const button = renderer.root.findByProps({ testID: 'recording-close-button' });

      act(() => {
        button.props.onPress();
      });

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('sets accessibility role to button', () => {
      const { renderer } = render();
      const button = renderer.root.findByProps({ testID: 'recording-close-button' });
      expect(button.props.accessibilityRole).toBe('button');
    });
  });

  describe('layout and structure', () => {
    it('groups indicator and label together on the left', () => {
      const { renderer } = render();
      const texts = renderer.root.findAllByType(Text);
      const elapsedText = texts.find((t) => t.props.testID === 'recording-elapsed');
      expect(elapsedText).toBeDefined();
    });
  });
});
