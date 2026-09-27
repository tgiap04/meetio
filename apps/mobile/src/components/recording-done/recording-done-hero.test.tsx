import TestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { RecordingDoneHero, formatRecordedDuration } from './recording-done-hero';

describe('formatRecordedDuration', () => {
  it('formats zero seconds', () => {
    expect(formatRecordedDuration(0)).toBe('0 giây');
  });

  it('formats less than a minute', () => {
    expect(formatRecordedDuration(45)).toBe('45 giây');
  });

  it('formats one minute', () => {
    expect(formatRecordedDuration(60)).toBe('1 phút 0 giây');
  });

  it('formats one minute thirty seconds', () => {
    expect(formatRecordedDuration(90)).toBe('1 phút 30 giây');
  });

  it('formats 42 minutes 18 seconds', () => {
    expect(formatRecordedDuration(2538)).toBe('42 phút 18 giây');
  });

  it('formats multiple minutes with leading zero seconds', () => {
    expect(formatRecordedDuration(120)).toBe('2 phút 0 giây');
  });

  it('formats large duration', () => {
    expect(formatRecordedDuration(3661)).toBe('61 phút 1 giây');
  });
});

describe('RecordingDoneHero', () => {
  function render(props: Partial<Parameters<typeof RecordingDoneHero>[0]> = {}) {
    const merged = {
      durationSec: 2538, // 42 minutes 18 seconds
      ...props,
    };

    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<RecordingDoneHero {...merged} />);
    });

    return renderer;
  }

  describe('title', () => {
    it('renders the confirmation title verbatim', () => {
      const renderer = render();
      const texts = renderer.root.findAllByType(Text).map((node) => node.props.children);
      expect(texts).toContain('Đã ghi âm xong!');
    });
  });

  describe('duration display', () => {
    it('renders the recorded duration', () => {
      const renderer = render({ durationSec: 2538 });
      const texts = renderer.root.findAllByType(Text).map((node) => node.props.children);
      expect(texts).toContain('42 phút 18 giây');
    });

    it('renders short duration', () => {
      const renderer = render({ durationSec: 15 });
      const texts = renderer.root.findAllByType(Text).map((node) => node.props.children);
      expect(texts).toContain('15 giây');
    });

    it('renders zero duration', () => {
      const renderer = render({ durationSec: 0 });
      const texts = renderer.root.findAllByType(Text).map((node) => node.props.children);
      expect(texts).toContain('0 giây');
    });

    it('does not render duration when durationSec is null', () => {
      const renderer = render({ durationSec: null });
      const texts = renderer.root.findAllByType(Text).map((node) => node.props.children);
      // Should not contain "phút" or "giây" for the duration
      const durationTexts = texts.filter((t) => typeof t === 'string' && (t.includes('phút') || t.includes('giây')));
      expect(durationTexts).toHaveLength(0);
    });
  });

  describe('transcript save message', () => {
    it('renders the transcript save confirmation', () => {
      const renderer = render();
      const texts = renderer.root.findAllByType(Text).map((node) => node.props.children);
      expect(texts).toContain('Transcript đã lưu đầy đủ trên máy chủ');
    });

    it('always renders the transcript save message regardless of duration', () => {
      const renderer1 = render({ durationSec: 100 });
      const renderer2 = render({ durationSec: null });

      const texts1 = renderer1.root.findAllByType(Text).map((n) => n.props.children);
      const texts2 = renderer2.root.findAllByType(Text).map((n) => n.props.children);

      expect(texts1).toContain('Transcript đã lưu đầy đủ trên máy chủ');
      expect(texts2).toContain('Transcript đã lưu đầy đủ trên máy chủ');
    });
  });

  describe('visual hierarchy', () => {
    it('renders title, duration (if provided), and message', () => {
      const renderer = render({ durationSec: 60 });
      const texts = renderer.root.findAllByType(Text).map((node) => node.props.children);
      expect(texts).toContain('Đã ghi âm xong!');
      expect(texts).toContain('1 phút 0 giây');
      expect(texts).toContain('Transcript đã lưu đầy đủ trên máy chủ');
    });

    it('renders the haloed check icon component', () => {
      const renderer = render();
      // The component has nested Views for the halo effect
      // Just verify the render succeeds without error
      expect(renderer.root).toBeDefined();
    });
  });

  describe('null duration handling', () => {
    it('gracefully handles null durationSec', () => {
      const renderer = render({ durationSec: null });
      expect(renderer.root).toBeDefined();
      const texts = renderer.root.findAllByType(Text).map((node) => node.props.children);
      expect(texts).toContain('Đã ghi âm xong!');
      expect(texts).toContain('Transcript đã lưu đầy đủ trên máy chủ');
    });
  });
});
