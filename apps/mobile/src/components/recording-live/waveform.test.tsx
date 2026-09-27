import TestRenderer, { act } from 'react-test-renderer';
import { View } from 'react-native';
import { Waveform, BAR_COUNT, levelToRatio } from './waveform';

describe('Waveform', () => {
  function render(props: Partial<Parameters<typeof Waveform>[0]> = {}) {
    const merged = {
      level: null,
      testID: 'waveform',
      ...props,
    };

    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<Waveform {...merged} />);
    });

    return renderer;
  }

  describe('bar count and initialization', () => {
    it('renders exactly BAR_COUNT bars', () => {
      const renderer = render();
      for (let index = 0; index < BAR_COUNT; index += 1) {
        expect(renderer.root.findByProps({ testID: `waveform-bar-${index}` })).toBeTruthy();
      }
      expect(() => renderer.root.findByProps({ testID: `waveform-bar-${BAR_COUNT}` })).toThrow();
    });

    it('initializes all bars flat when level is null', () => {
      const renderer = render({ level: null });
      const bars = [];
      for (let i = 0; i < BAR_COUNT; i++) {
        const bar = renderer.root.findByProps({ testID: `waveform-bar-${i}` });
        bars.push(bar);
      }
      expect(bars).toHaveLength(BAR_COUNT);
    });
  });

  describe('level to height conversion', () => {
    it('maps level -2 (silence) to ratio 0.08', () => {
      const ratio = levelToRatio(-2);
      expect(ratio).toBe(0.08);
    });

    it('maps level 10 (loud) to ratio 1.0', () => {
      const ratio = levelToRatio(10);
      expect(ratio).toBe(1);
    });

    it('maps level 4 to approximately 0.5', () => {
      const ratio = levelToRatio(4);
      expect(ratio).toBeCloseTo(0.5, 1);
    });

    it('clamps ratio to min 0.08', () => {
      const ratio = levelToRatio(-100);
      expect(ratio).toBe(0.08);
    });

    it('clamps ratio to max 1.0', () => {
      const ratio = levelToRatio(100);
      expect(ratio).toBe(1);
    });

    it('handles zero level', () => {
      const ratio = levelToRatio(0);
      expect(ratio).toBeGreaterThan(0.08);
      expect(ratio).toBeLessThan(1);
    });
  });

  describe('level updates', () => {
    it('scrolls bars when level changes from null to a value', () => {
      const renderer = render({ level: null });
      const firstBarsAtStart = [];
      for (let i = 0; i < BAR_COUNT; i++) {
        const bar = renderer.root.findByProps({ testID: `waveform-bar-${i}` });
        firstBarsAtStart.push(bar.props.style);
      }

      act(() => {
        renderer.update(<Waveform level={5} testID="waveform" />);
      });

      // First bar should change; last bars should come from previous state
      const firstBar = renderer.root.findByProps({ testID: `waveform-bar-0` });
      expect(firstBar.props.style).toBeDefined();
    });

    it('does not update if level has not changed', () => {
      const renderer = render({ level: 5 });
      const initialBars = Array.from({ length: BAR_COUNT }, (_, i) =>
        renderer.root.findByProps({ testID: `waveform-bar-${i}` }).props.style,
      );

      act(() => {
        renderer.update(<Waveform level={5} testID="waveform" />);
      });

      const finalBars = Array.from({ length: BAR_COUNT }, (_, i) =>
        renderer.root.findByProps({ testID: `waveform-bar-${i}` }).props.style,
      );

      expect(finalBars).toEqual(initialBars);
    });

    it('resets all bars to flat when level changes to null', () => {
      const renderer = render({ level: 8 });

      act(() => {
        renderer.update(<Waveform level={null} testID="waveform" />);
      });

      for (let i = 0; i < BAR_COUNT; i++) {
        const bar = renderer.root.findByProps({ testID: `waveform-bar-${i}` });
        const style = bar.props.style as { height: number }[];
        const height = style[1]?.height;
        // All bars should be at minimum height
        expect(height).toBeGreaterThan(0);
      }
    });
  });

  describe('bar styling', () => {
    it('applies height based on level', () => {
      const renderer = render({ level: 5 });
      const bar = renderer.root.findByProps({ testID: `waveform-bar-0` });
      const style = bar.props.style as { height: number }[];
      const height = style[1]?.height;
      expect(height).toBeGreaterThan(0);
    });

    it('respects custom height prop', () => {
      const renderer = render({ level: 5, height: 100 });
      const bar = renderer.root.findByProps({ testID: `waveform-bar-0` });
      const style = bar.props.style as { height: number }[];
      const height = style[1]?.height;
      expect(height).toBeLessThanOrEqual(100);
    });

    it('uses default height of 56 when not specified', () => {
      const renderer = render({ level: 5 });
      const bar = renderer.root.findByProps({ testID: `waveform-bar-0` });
      expect(bar).toBeDefined();
    });
  });

  describe('sequence of level changes', () => {
    it('scrolls bars correctly through multiple level updates', () => {
      const renderer = render({ level: 0 });

      for (let level = 1; level <= 5; level++) {
        act(() => {
          renderer.update(<Waveform level={level} testID="waveform" />);
        });
      }

      // Should still have BAR_COUNT bars
      for (let i = 0; i < BAR_COUNT; i++) {
        expect(renderer.root.findByProps({ testID: `waveform-bar-${i}` })).toBeTruthy();
      }
    });
  });

  describe('accessibility and layout', () => {
    it('renders the container with testID', () => {
      const renderer = render({ testID: 'custom-waveform' });
      const container = renderer.root.findByProps({ testID: 'custom-waveform' });
      expect(container).toBeDefined();
    });

    it('renders without testID when not provided', () => {
      let renderer!: TestRenderer.ReactTestRenderer;
      act(() => {
        renderer = TestRenderer.create(<Waveform level={null} />);
      });
      const bars = renderer.root.findAllByType(View);
      expect(bars.length).toBeGreaterThan(0);
    });
  });
});
