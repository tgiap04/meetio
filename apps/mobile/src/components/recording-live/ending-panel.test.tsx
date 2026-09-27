import TestRenderer, { act } from 'react-test-renderer';
import { Text, ActivityIndicator } from 'react-native';
import { EndingPanel } from './ending-panel';

describe('EndingPanel', () => {
  function render(props: Partial<Parameters<typeof EndingPanel>[0]> = {}) {
    const onLeave = jest.fn();
    const merged = {
      pending: 0,
      online: true,
      onLeave,
      ...props,
    };

    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<EndingPanel {...merged} />);
    });

    return { renderer, onLeave };
  }

  describe('online state with syncing', () => {
    it('shows spinner when online and syncing', () => {
      const { renderer } = render({ pending: 2, online: true });
      const spinner = renderer.root.findAllByType(ActivityIndicator);
      expect(spinner.length).toBeGreaterThan(0);
    });

    it('shows "Đang hoàn tất cuộc họp" title when online', () => {
      const { renderer } = render({ pending: 2, online: true });
      const texts = renderer.root.findAllByType(Text).map((n) => n.props.children);
      expect(texts).toContain('Đang hoàn tất cuộc họp');
    });

    it('shows "Đang đồng bộ N đoạn còn lại lên máy chủ…" when online with pending segments', () => {
      const { renderer } = render({ pending: 5, online: true });
      const texts = renderer.root.findAllByType(Text).map((n) => n.props.children);
      expect(texts.join(' ')).toContain('Đang đồng bộ 5 đoạn');
    });

    it('shows "Đang báo máy chủ kết thúc cuộc họp…" when online with no pending', () => {
      const { renderer } = render({ pending: 0, online: true });
      const texts = renderer.root.findAllByType(Text).map((n) => n.props.children);
      expect(texts).toContain('Đang báo máy chủ kết thúc cuộc họp…');
    });
  });

  describe('offline state', () => {
    it('hides spinner when offline', () => {
      const { renderer } = render({ pending: 0, online: false });
      const spinner = renderer.root.findAllByType(ActivityIndicator);
      expect(spinner).toHaveLength(0);
    });

    it('shows "Chưa có kết nối mạng" title when offline', () => {
      const { renderer } = render({ pending: 0, online: false });
      const texts = renderer.root.findAllByType(Text).map((n) => n.props.children);
      expect(texts).toContain('Chưa có kết nối mạng');
    });

    it('shows "N đoạn được giữ an toàn trên máy…" when offline with pending', () => {
      const { renderer } = render({ pending: 3, online: false });
      const texts = renderer.root.findAllByType(Text).map((n) => n.props.children);
      expect(texts.join(' ')).toContain('3 đoạn');
    });

    it('shows "Transcript được giữ an toàn trên máy…" when offline with no pending', () => {
      const { renderer } = render({ pending: 0, online: false });
      const texts = renderer.root.findAllByType(Text).map((n) => n.props.children);
      expect(texts.join(' ')).toContain('Transcript');
    });

    it('shows "Về trang chủ" button when offline', () => {
      const { renderer } = render({ pending: 0, online: false });
      const buttons = renderer.root.findAllByProps({ label: 'Về trang chủ' });
      expect(buttons.length).toBeGreaterThan(0);
    });

    it('does not show button when online', () => {
      const { renderer } = render({ pending: 0, online: true });
      const buttons = renderer.root.findAllByProps({ label: 'Về trang chủ' });
      expect(buttons).toHaveLength(0);
    });
  });

  describe('pending segment counts', () => {
    it('displays the pending count in the message when online', () => {
      const { renderer } = render({ pending: 1, online: true });
      const texts = renderer.root.findAllByType(Text).map((n) => n.props.children);
      expect(texts.join(' ')).toContain('1 đoạn');
    });

    it('displays the pending count in the message when offline', () => {
      const { renderer } = render({ pending: 10, online: false });
      const texts = renderer.root.findAllByType(Text).map((n) => n.props.children);
      expect(texts.join(' ')).toContain('10 đoạn');
    });

    it('handles zero pending gracefully online', () => {
      const { renderer } = render({ pending: 0, online: true });
      const texts = renderer.root.findAllByType(Text).map((n) => n.props.children);
      expect(texts).toContain('Đang báo máy chủ kết thúc cuộc họp…');
    });

    it('handles zero pending gracefully offline', () => {
      const { renderer } = render({ pending: 0, online: false });
      const texts = renderer.root.findAllByType(Text).map((n) => n.props.children);
      expect(texts.join(' ')).toContain('Transcript');
    });
  });

  describe('leave button interaction', () => {
    it('shows leave button only when offline', () => {
      const { renderer } = render({ online: false });
      const button = renderer.root.findByProps({ label: 'Về trang chủ' });
      expect(button).toBeDefined();
    });

    it('calls onLeave when button is pressed', () => {
      const { renderer, onLeave } = render({ online: false });
      const button = renderer.root.findByProps({ label: 'Về trang chủ' });

      act(() => {
        button.props.onPress();
      });

      expect(onLeave).toHaveBeenCalledTimes(1);
    });

    it('button not visible when online regardless of pending', () => {
      const rendererWithPending = render({ pending: 10, online: true });
      let buttons = rendererWithPending.renderer.root.findAllByProps({ label: 'Về trang chủ' });
      expect(buttons).toHaveLength(0);

      const rendererNoPending = render({ pending: 0, online: true });
      buttons = rendererNoPending.renderer.root.findAllByProps({ label: 'Về trang chủ' });
      expect(buttons).toHaveLength(0);
    });
  });

  describe('state transitions', () => {
    it('transitions from online syncing to offline', () => {
      const { renderer, onLeave } = render({ pending: 5, online: true });
      let texts = renderer.root.findAllByType(Text).map((n) => n.props.children);
      expect(texts).toContain('Đang hoàn tất cuộc họp');

      act(() => {
        renderer.update(<EndingPanel pending={5} online={false} onLeave={onLeave} />);
      });

      texts = renderer.root.findAllByType(Text).map((n) => n.props.children);
      expect(texts).toContain('Chưa có kết nối mạng');

      const button = renderer.root.findByProps({ label: 'Về trang chủ' });
      expect(button).toBeDefined();
    });

    it('transitions from offline to online', () => {
      const { renderer, onLeave } = render({ pending: 5, online: false });
      let texts = renderer.root.findAllByType(Text).map((n) => n.props.children);
      expect(texts).toContain('Chưa có kết nối mạng');

      act(() => {
        renderer.update(<EndingPanel pending={5} online={true} onLeave={onLeave} />);
      });

      texts = renderer.root.findAllByType(Text).map((n) => n.props.children);
      expect(texts).toContain('Đang hoàn tất cuộc họp');

      const buttons = renderer.root.findAllByProps({ label: 'Về trang chủ' });
      expect(buttons).toHaveLength(0);
    });

    it('updates pending count while online', () => {
      const { renderer, onLeave } = render({ pending: 3, online: true });
      let texts = renderer.root.findAllByType(Text).map((n) => n.props.children);
      expect(texts.join(' ')).toContain('3 đoạn');

      act(() => {
        renderer.update(<EndingPanel pending={1} online={true} onLeave={onLeave} />);
      });

      texts = renderer.root.findAllByType(Text).map((n) => n.props.children);
      expect(texts.join(' ')).toContain('1 đoạn');
    });

    it('completes syncing while online', () => {
      const { renderer, onLeave } = render({ pending: 2, online: true });
      let texts = renderer.root.findAllByType(Text).map((n) => n.props.children);
      expect(texts.join(' ')).toContain('2 đoạn');

      act(() => {
        renderer.update(<EndingPanel pending={0} online={true} onLeave={onLeave} />);
      });

      texts = renderer.root.findAllByType(Text).map((n) => n.props.children);
      expect(texts).toContain('Đang báo máy chủ kết thúc cuộc họp…');
    });
  });

  describe('testID', () => {
    it('renders with testID for the panel', () => {
      const { renderer } = render();
      const panel = renderer.root.findByProps({ testID: 'ending-panel' });
      expect(panel).toBeDefined();
    });
  });
});
