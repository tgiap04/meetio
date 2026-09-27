import TestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { SyncIndicator, syncLabel } from './sync-indicator';

describe('SyncIndicator', () => {
  function render(props: Parameters<typeof SyncIndicator>[0]) {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<SyncIndicator {...props} />);
    });
    return renderer;
  }

  describe('syncLabel function', () => {
    it('returns "Đã đồng bộ" when online and no pending segments', () => {
      const label = syncLabel({ pending: 0, online: true });
      expect(label).toBe('Đã đồng bộ');
    });

    it('returns "Đang chờ đồng bộ N đoạn" when online with pending segments', () => {
      const label = syncLabel({ pending: 3, online: true });
      expect(label).toBe('Đang chờ đồng bộ 3 đoạn');
    });

    it('returns "Mất kết nối" when offline with no pending segments', () => {
      const label = syncLabel({ pending: 0, online: false });
      expect(label).toBe('Mất kết nối');
    });

    it('returns "Mất kết nối · N đoạn đang giữ trên máy" when offline with pending segments', () => {
      const label = syncLabel({ pending: 5, online: false });
      expect(label).toBe('Mất kết nối · 5 đoạn đang giữ trên máy');
    });

    it('handles large numbers of pending segments', () => {
      const label = syncLabel({ pending: 999, online: true });
      expect(label).toBe('Đang chờ đồng bộ 999 đoạn');
    });
  });

  describe('rendering', () => {
    it('renders the label text', () => {
      const renderer = render({ pending: 0, online: true });
      const texts = renderer.root.findAllByType(Text).map((n) => n.props.children);
      expect(texts).toContain('Đã đồng bộ');
    });

    it('renders the synced state when online and no pending', () => {
      const renderer = render({ pending: 0, online: true });
      const texts = renderer.root.findAllByType(Text).map((n) => n.props.children);
      expect(texts).toContain('Đã đồng bộ');
    });

    it('renders the syncing state when online with pending', () => {
      const renderer = render({ pending: 3, online: true });
      const texts = renderer.root.findAllByType(Text).map((n) => n.props.children);
      expect(texts).toContain('Đang chờ đồng bộ 3 đoạn');
    });

    it('renders the offline state without pending', () => {
      const renderer = render({ pending: 0, online: false });
      const texts = renderer.root.findAllByType(Text).map((n) => n.props.children);
      expect(texts).toContain('Mất kết nối');
    });

    it('renders the offline-with-pending state', () => {
      const renderer = render({ pending: 2, online: false });
      const texts = renderer.root.findAllByType(Text).map((n) => n.props.children);
      expect(texts.join(' ')).toContain('2 đoạn');
    });
  });

  describe('icon selection', () => {
    it('shows checkCircle icon when online', () => {
      const renderer = render({ pending: 0, online: true });
      const icons = renderer.root.findAllByProps({ name: 'checkCircle' });
      expect(icons.length).toBeGreaterThan(0);
    });

    it('shows offline icon when offline', () => {
      const renderer = render({ pending: 0, online: false });
      const icons = renderer.root.findAllByProps({ name: 'offline' });
      expect(icons.length).toBeGreaterThan(0);
    });
  });

  describe('accessibility', () => {
    it('sets live region to polite', () => {
      const renderer = render({ pending: 0, online: true });
      const indicator = renderer.root.findByProps({ testID: 'sync-indicator' });
      expect(indicator.props.accessibilityLiveRegion).toBe('polite');
    });

    it('renders with accessible text', () => {
      const renderer = render({ pending: 0, online: true });
      const texts = renderer.root.findAllByType(Text);
      expect(texts.length).toBeGreaterThan(0);
    });
  });

  describe('state transitions', () => {
    it('updates from online/synced to online/syncing', () => {
      const renderer = render({ pending: 0, online: true });
      let texts = renderer.root.findAllByType(Text).map((n) => n.props.children);
      expect(texts).toContain('Đã đồng bộ');

      act(() => {
        renderer.update(<SyncIndicator pending={2} online={true} />);
      });

      texts = renderer.root.findAllByType(Text).map((n) => n.props.children);
      expect(texts).toContain('Đang chờ đồng bộ 2 đoạn');
    });

    it('updates from online to offline', () => {
      const renderer = render({ pending: 2, online: true });
      let texts = renderer.root.findAllByType(Text).map((n) => n.props.children);
      expect(texts).toContain('Đang chờ đồng bộ 2 đoạn');

      act(() => {
        renderer.update(<SyncIndicator pending={2} online={false} />);
      });

      texts = renderer.root.findAllByType(Text).map((n) => n.props.children);
      expect(texts.join(' ')).toContain('Mất kết nối');
    });

    it('updates from offline back to online', () => {
      const renderer = render({ pending: 1, online: false });
      let texts = renderer.root.findAllByType(Text).map((n) => n.props.children);
      expect(texts.join(' ')).toContain('Mất kết nối');

      act(() => {
        renderer.update(<SyncIndicator pending={1} online={true} />);
      });

      texts = renderer.root.findAllByType(Text).map((n) => n.props.children);
      expect(texts).toContain('Đang chờ đồng bộ 1 đoạn');
    });

    it('clears all pending when synced', () => {
      const renderer = render({ pending: 5, online: true });
      let texts = renderer.root.findAllByType(Text).map((n) => n.props.children);
      expect(texts).toContain('Đang chờ đồng bộ 5 đoạn');

      act(() => {
        renderer.update(<SyncIndicator pending={0} online={true} />);
      });

      texts = renderer.root.findAllByType(Text).map((n) => n.props.children);
      expect(texts).toContain('Đã đồng bộ');
    });
  });
});
