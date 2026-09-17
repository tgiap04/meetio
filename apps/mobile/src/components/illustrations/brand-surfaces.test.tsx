import type { ReactElement } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { LinearGradient } from 'expo-linear-gradient';
import { BrandFill } from './brand-fill';
import { ScreenBackdrop } from './screen-backdrop';
import { AppMark } from './app-mark';
import { MicPermissionArt } from './mic-permission-art';
import { OnboardingArt } from './onboarding-art';
import { colors } from '../../theme/colors';

function renderSync(element: ReactElement): TestRenderer.ReactTestRenderer {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(element);
  });
  return renderer;
}

describe('BrandFill', () => {
  it('paints the measured diagonal gradient rather than a flat colour', () => {
    const renderer = renderSync(<BrandFill testID="fill" />);
    const gradient = renderer.root.findByType(LinearGradient);

    expect(gradient.props.colors).toEqual([colors.primaryGradientFrom, colors.primaryGradientTo]);
    expect(gradient.props.start).toEqual({ x: 0, y: 0 });
    expect(gradient.props.end).toEqual({ x: 1, y: 1 });
  });

  it('runs light to deep, matching the design', () => {
    // A gradient pointing the wrong way is still "a gradient" and would pass a
    // weaker assertion, so pin the direction to the sampled one.
    expect(colors.primaryGradientFrom).toBe('#FD8021');
    expect(colors.primaryGradientTo).toBe('#F56904');
  });
});

describe('the orange shapes all use the gradient', () => {
  it.each([
    ['AppMark', <AppMark key="a" size={96} />],
    ['MicPermissionArt', <MicPermissionArt key="m" size={220} />],
    ['OnboardingArt', <OnboardingArt key="o" size={240} />],
  ])('%s renders a gradient fill', (_label, element) => {
    // These three shipped as flat fills first. If one ever regresses to a plain
    // View with backgroundColor, there is no LinearGradient to find.
    const renderer = renderSync(element);
    expect(renderer.root.findAllByType(LinearGradient).length).toBeGreaterThan(0);
  });
});

describe('ScreenBackdrop', () => {
  it('places a peach shape in both corners over the cream surface', () => {
    const renderer = renderSync(<ScreenBackdrop width={390} testID="backdrop" />);

    expect(renderer.root.findByProps({ testID: 'backdrop-top' })).toBeTruthy();
    expect(renderer.root.findByProps({ testID: 'backdrop-bottom' })).toBeTruthy();
  });

  it('never intercepts a press meant for the content above it', () => {
    // The backdrop covers the whole screen and is rendered before the content.
    // Without pointerEvents="none" it would swallow every button press on the
    // onboarding and permission screens — a failure that looks like "the button
    // is broken", nowhere near the decoration that actually caused it.
    // Read the host tree, not the fiber tree: findByProps({testID}) also matches
    // the ScreenBackdrop composite, whose props carry no pointerEvents.
    const tree = renderSync(<ScreenBackdrop width={390} testID="backdrop" />).toJSON();
    const host = Array.isArray(tree) ? tree[0] : tree;

    expect(host?.props.pointerEvents).toBe('none');
  });

  it('scales its shapes with the screen width', () => {
    const narrow = renderSync(<ScreenBackdrop width={320} testID="b" />);
    const wide = renderSync(<ScreenBackdrop width={430} testID="b" />);

    const sizeOf = (r: TestRenderer.ReactTestRenderer) =>
      r.root.findByProps({ testID: 'b-top' }).props.size;

    expect(sizeOf(wide)).toBeGreaterThan(sizeOf(narrow));
  });
});
