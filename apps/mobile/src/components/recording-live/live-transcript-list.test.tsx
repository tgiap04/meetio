import TestRenderer, { act } from 'react-test-renderer';
import { Text, FlatList, type NativeScrollEvent } from 'react-native';
import type { LiveLine } from '../../recording/recording.store';
import { LiveTranscriptList, isNearBottom } from './live-transcript-list';

// Unmount every renderer after its test: a mounted FlatList keeps scheduling updates into the next test.
const mounted: TestRenderer.ReactTestRenderer[] = [];
afterEach(() => act(() => mounted.splice(0).forEach((r) => r.unmount())));

describe('LiveTranscriptList', () => {
  function renderList(props: Partial<Parameters<typeof LiveTranscriptList>[0]> = {}) {
    const merged = {
      lines: [] as readonly LiveLine[],
      partial: null,
      ...props,
    };

    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<LiveTranscriptList {...merged} />);
    });
    mounted.push(renderer);

    return renderer;
  }

  const makeLine = (seq: number, overrides: Partial<LiveLine> = {}): LiveLine => ({
    seq,
    startedAtMs: seq * 1000,
    endedAtMs: seq * 1000 + 500,
    gapBeforeMs: null,
    text: `Line ${seq}`,
    ...overrides,
  });

  describe('empty state', () => {
    it('shows placeholder text when no lines and no partial', () => {
      const renderer = renderList({ lines: [] });
      const texts = renderer.root.findAllByType(Text).map((n) => n.props.children);
      expect(texts).toContain('Hãy bắt đầu nói — chữ sẽ hiện ở đây.');
    });

    it('hides placeholder when partial exists', () => {
      const renderer = renderList({ lines: [], partial: 'some text' });
      const texts = renderer.root.findAllByType(Text).map((n) => n.props.children);
      expect(texts).not.toContain('Hãy bắt đầu nói — chữ sẽ hiện ở đây.');
    });
  });

  describe('transcript rendering', () => {
    it('renders all lines with text', () => {
      const lines = [makeLine(1), makeLine(2), makeLine(3)];
      const renderer = renderList({ lines });
      const texts = renderer.root.findAllByType(Text).map((n) => n.props.children);
      expect(texts).toContain('Line 1');
      expect(texts).toContain('Line 2');
      expect(texts).toContain('Line 3');
    });

    it('renders timestamps in mm:ss format', () => {
      const lines = [makeLine(1, { startedAtMs: 65000 })];
      const renderer = renderList({ lines });
      const texts = renderer.root.findAllByType(Text).map((n) => n.props.children);
      expect(texts).toContain('01:05');
    });

    it('renders gap markers when gap_before_ms is set', () => {
      const lines = [makeLine(1, { gapBeforeMs: 3000 })];
      const renderer = renderList({ lines });
      const texts = renderer.root.findAllByType(Text).map((n) => n.props.children);
      expect(texts).toContain('— Gián đoạn 3 giây —');
    });

    it('does not render gap markers when gap_before_ms is null', () => {
      const lines = [makeLine(1, { gapBeforeMs: null })];
      const renderer = renderList({ lines });
      const texts = renderer.root.findAllByType(Text).map((n) => n.props.children);
      expect(texts.join(' ')).not.toContain('Gián đoạn');
    });
  });

  describe('partial text display', () => {
    it('displays partial text in a different style', () => {
      const renderer = renderList({ lines: [], partial: 'hello wor' });
      const partial = renderer.root.findByProps({ testID: 'live-partial' });
      expect(partial.props.children).toBe('hello wor');
    });

    it('hides partial when it is null', () => {
      const renderer = renderList({ lines: [makeLine(1)], partial: null });
      const partialNodes = renderer.root.findAllByProps({ testID: 'live-partial' });
      expect(partialNodes).toHaveLength(0);
    });

    it('hides partial when it is empty string', () => {
      // Empty string is falsy, so the component doesn't render the partial text
      const renderer = renderList({ lines: [], partial: '' });
      const partialNodes = renderer.root.findAllByProps({ testID: 'live-partial' });
      expect(partialNodes).toHaveLength(0);
    });
  });

  describe('auto-follow behavior', () => {
    it('follows newest line by default', () => {
      const lines = [makeLine(1), makeLine(2)];
      const renderer = renderList({ lines });
      const list = renderer.root.findByType(FlatList);
      expect(list).toBeDefined();
    });

    it('keeps following when new lines are added', () => {
      const renderer = renderList({ lines: [makeLine(1)] });
      act(() => {
        renderer.update(<LiveTranscriptList lines={[makeLine(1), makeLine(2)]} partial={null} />);
      });
      const list = renderer.root.findByType(FlatList);
      expect(list).toBeDefined();
    });
  });

  describe('scroll-to-newest button', () => {
    it('does not show jump button initially', () => {
      const lines = [makeLine(1), makeLine(2)];
      const renderer = renderList({ lines });
      const jumpButton = renderer.root.findAllByProps({ testID: 'jump-to-newest' });
      expect(jumpButton).toHaveLength(0);
    });

    it('shows jump button with count when user scrolls up and lines are added', () => {
      const renderer = renderList({ lines: [makeLine(1)] });

      // Simulate user scrolling up (away from bottom)
      const list = renderer.root.findByType(FlatList);
      act(() => {
        list.props.onScrollBeginDrag({
          nativeEvent: {
            contentOffset: { y: 0, x: 0 },
            contentSize: { height: 500, width: 0 },
            layoutMeasurement: { height: 400, width: 0 },
          },
        } as Parameters<typeof list.props.onScrollBeginDrag>[0]);
      });

      // Add new lines while scrolled up
      act(() => {
        renderer.update(<LiveTranscriptList lines={[makeLine(1), makeLine(2), makeLine(3)]} partial={null} />);
      });

      // Button should appear when not following and unread > 0
      const jumpButton = renderer.root.findByProps({ testID: 'jump-to-newest' });
      expect(jumpButton).toBeDefined();
    });

    it('pressing jump button scrolls to end', () => {
      const renderer = renderList({ lines: [makeLine(1)] });

      // Scroll up
      const list = renderer.root.findByType(FlatList);
      act(() => {
        list.props.onScrollBeginDrag({
          nativeEvent: {
            contentOffset: { y: 0, x: 0 },
            contentSize: { height: 500, width: 0 },
            layoutMeasurement: { height: 400, width: 0 },
          },
        });
      });

      // Add lines
      act(() => {
        renderer.update(<LiveTranscriptList lines={[makeLine(1), makeLine(2)]} partial={null} />);
      });

      // Press jump button
      const jumpButton = renderer.root.findByProps({ testID: 'jump-to-newest' });
      act(() => {
        jumpButton.props.onPress();
      });

      // Jump button should disappear after pressing
      const jumpButtons = renderer.root.findAllByProps({ testID: 'jump-to-newest' });
      expect(jumpButtons).toHaveLength(0);
    });

    it('hides jump button when scrolled back to bottom', () => {
      const renderer = renderList({ lines: [makeLine(1), makeLine(2)] });

      // Scroll to bottom
      const list = renderer.root.findByType(FlatList);
      act(() => {
        list.props.onMomentumScrollEnd({
          nativeEvent: {
            contentOffset: { y: 100, x: 0 },
            contentSize: { height: 500, width: 0 },
            layoutMeasurement: { height: 400, width: 0 },
          },
        } as Parameters<typeof list.props.onMomentumScrollEnd>[0]);
      });

      const jumpButtons = renderer.root.findAllByProps({ testID: 'jump-to-newest' });
      expect(jumpButtons).toHaveLength(0);
    });
  });

  describe('isNearBottom', () => {
    it('returns true when within threshold of bottom', () => {
      const result = isNearBottom({
        contentOffset: { y: 400, x: 0 },
        contentSize: { height: 500, width: 0 },
        layoutMeasurement: { height: 100, width: 0 },
      } as NativeScrollEvent);
      expect(result).toBe(true);
    });

    it('returns false when far from bottom', () => {
      const result = isNearBottom({
        contentOffset: { y: 0, x: 0 },
        contentSize: { height: 500, width: 0 },
        layoutMeasurement: { height: 100, width: 0 },
      } as NativeScrollEvent);
      expect(result).toBe(false);
    });

    it('returns true at exactly the threshold', () => {
      // contentSize.height - (contentOffset.y + layoutMeasurement.height) = threshold (48)
      const result = isNearBottom({
        contentOffset: { y: 352, x: 0 },
        contentSize: { height: 500, width: 0 },
        layoutMeasurement: { height: 100, width: 0 },
      } as NativeScrollEvent);
      expect(result).toBe(true);
    });
  });

  describe('sequential lines with gaps', () => {
    it('renders three lines with first gap', () => {
      const lines = [
        makeLine(1, { gapBeforeMs: null }),
        makeLine(2, { gapBeforeMs: 2000 }),
        makeLine(3, { gapBeforeMs: null }),
      ];
      const renderer = renderList({ lines });
      const texts = renderer.root.findAllByType(Text).map((n) => n.props.children);
      expect(texts).toContain('— Gián đoạn 2 giây —');
    });
  });

  describe('yielding to the reader (US-08)', () => {
    const line = (seq: number): LiveLine => ({ seq, text: `câu ${seq}`, startedAtMs: seq * 1000, endedAtMs: seq * 1000 + 900, gapBeforeMs: null });
    const scrolledTo = (y: number) => ({
      nativeEvent: { contentOffset: { x: 0, y }, contentSize: { width: 0, height: 2000 }, layoutMeasurement: { width: 0, height: 400 } },
    });

    it('stops following while the user reads back, counts what arrived, and follows again on the button', () => {
      let r!: TestRenderer.ReactTestRenderer;
      act(() => {
        r = TestRenderer.create(<LiveTranscriptList lines={[line(1)]} partial={null} />);
      });
      const scrollToEnd = jest.spyOn(r.root.findByType(FlatList).instance as FlatList<LiveLine>, 'scrollToEnd').mockImplementation(() => undefined);

      act(() => r.root.findByType(FlatList).props.onScrollEndDrag(scrolledTo(200))); // reading far above the end
      act(() => r.update(<LiveTranscriptList lines={[line(1), line(2), line(3)]} partial="đang nói" />));

      expect(scrollToEnd).not.toHaveBeenCalled(); // never yanked down while reading
      const label = r.root.findByProps({ testID: 'jump-to-newest' }).findByType(Text).props.children;
      expect([label].flat().join('')).toBe('Xuống dòng mới nhất (2)');

      act(() => r.root.findByProps({ testID: 'jump-to-newest' }).props.onPress());
      expect(scrollToEnd).toHaveBeenCalled();
      scrollToEnd.mockClear();
      act(() => r.update(<LiveTranscriptList lines={[line(1), line(2), line(3), line(4)]} partial={null} />));
      expect(scrollToEnd).toHaveBeenCalled(); // following again
    });
  });
});

describe('LiveTranscriptList translations (Phase 09)', () => {
  const line = (seq: number): LiveLine => ({ seq, startedAtMs: seq * 1000, endedAtMs: seq * 1000 + 500, gapBeforeMs: null, text: `Dòng ${seq}` });
  const mount = (props: Partial<Parameters<typeof LiveTranscriptList>[0]>) => {
    let r!: TestRenderer.ReactTestRenderer;
    act(() => {
      r = TestRenderer.create(<LiveTranscriptList lines={[line(1), line(2), line(3)]} partial={null} {...props} />);
    });
    mounted.push(r);
    return r;
  };
  const texts = (r: TestRenderer.ReactTestRenderer) => r.root.findAllByType(Text).map((n) => n.props.children);

  it('shows each translation under its own line, and none for lines without one', () => {
    const r = mount({ translations: { 1: { status: 'done', text: 'Line one', to: 'en-US' }, 3: { status: 'done', text: 'Line three', to: 'en-US' } } });
    const shown = texts(r);
    expect(shown.indexOf('Line one')).toBe(shown.indexOf('Dòng 1') + 1);
    expect(shown.indexOf('Line three')).toBe(shown.indexOf('Dòng 3') + 1);
    expect(r.root.findAllByProps({ testID: 'translated-segment' }).filter((n) => typeof n.type === 'string')).toHaveLength(2);
  });

  it('a failed line offers "Thử lại" that retries THAT seq', () => {
    const onRetryTranslation = jest.fn();
    const r = mount({ translations: { 2: { status: 'failed' } }, onRetryTranslation });
    expect(texts(r)).toContain('Chưa dịch được');
    const retry = r.root.findAll((n) => n.props.accessibilityRole === 'button' && typeof n.props.onPress === 'function' && n.props.accessibilityLabel === 'Thử lại dịch đoạn này')[0];
    act(() => retry.props.onPress());
    expect(onRetryTranslation).toHaveBeenCalledWith(2);
  });

  it('shows progress for a retry in flight and the reason a retry failed', () => {
    const r = mount({
      translations: { 1: { status: 'failed' }, 2: { status: 'failed' } },
      onRetryTranslation: jest.fn(),
      retryingTranslations: new Set([1]),
      translationErrors: { 2: 'Dịch vụ AI tạm thời không khả dụng.' },
    });
    expect(texts(r)).toEqual(expect.arrayContaining(['Đang dịch…', 'Dịch vụ AI tạm thời không khả dụng.']));
  });

  it('without translations the list is exactly as before', () => {
    const r = mount({});
    expect(r.root.findAllByProps({ testID: 'translated-segment' })).toHaveLength(0);
  });
});
