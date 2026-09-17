import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { AppSplash } from './app-splash';
import { PagerDots } from '../pager-dots';
import { isRenderableVietnameseText } from '../../theme/typography';

/**
 * `AppSplash` must render with zero providers (decisions.md, phase-04 spec) —
 * this file wraps it in nothing, which is itself the proof of that
 * requirement, not just a convenience.
 */
describe('AppSplash', () => {
  it('renders bare, with the wordmark and the two-line tagline', () => {
    let renderer: TestRenderer.ReactTestRenderer | undefined;
    act(() => {
      renderer = TestRenderer.create(<AppSplash />);
    });

    const texts = renderer!.root.findAllByType(Text).map((node) => node.props.children);
    const flat = texts.flat().join('');

    expect(flat).toContain('Meetio');
    expect(flat).toContain('Ghi âm mọi cuộc họp,');
    expect(flat).toContain('biến lời nói thành tri thức.');
  });

  it('renders the tagline as exactly two lines', () => {
    let renderer: TestRenderer.ReactTestRenderer | undefined;
    act(() => {
      renderer = TestRenderer.create(<AppSplash />);
    });

    const taglineNode = renderer!.root.findByProps({ testID: 'app-splash-tagline' });
    const lines = taglineNode.props.children as string;

    expect(lines.split('\n')).toHaveLength(2);
    expect(isRenderableVietnameseText(lines)).toBe(true);
  });

  it('shows PagerDots with the first dot active', () => {
    let renderer: TestRenderer.ReactTestRenderer | undefined;
    act(() => {
      renderer = TestRenderer.create(<AppSplash />);
    });

    const dots = renderer!.root.findByType(PagerDots);
    expect(dots.props.count).toBe(3);
    expect(dots.props.activeIndex).toBe(0);
  });

  it('exposes testID="app-splash" on its root', () => {
    let renderer: TestRenderer.ReactTestRenderer | undefined;
    act(() => {
      renderer = TestRenderer.create(<AppSplash />);
    });

    expect(() => renderer!.root.findByProps({ testID: 'app-splash' })).not.toThrow();
  });
});
