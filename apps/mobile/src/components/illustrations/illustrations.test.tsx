import type { ReactElement } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Arc } from './arc';
import { Blob } from './blob';
import { AppMark } from './app-mark';
import { MicGlyph } from './mic-glyph';
import { OnboardingArt } from './onboarding-art';
import { MicPermissionArt } from './mic-permission-art';

const SIZES = [64, 128];

function renderSync(element: ReactElement): TestRenderer.ReactTestRenderer {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(element);
  });
  return renderer;
}

describe('Arc', () => {
  it('renders without throwing at multiple sizes and spans', () => {
    SIZES.forEach((size) => {
      expect(() => renderSync(<Arc size={size} arcSpan="half" color="#F68001" rotation={45} />)).not.toThrow();
    });
  });

  it('colors only the sides selected by arcSpan', () => {
    const renderer = renderSync(<Arc size={64} arcSpan="quarter" color="#F68001" testID="arc" />);
    const json = renderer.toJSON();
    const style = Array.isArray(json) ? json[0]?.props.style : json?.props.style;
    expect(style.borderTopColor).toBe('#F68001');
    expect(style.borderRightColor).toBe('transparent');
    expect(style.borderBottomColor).toBe('transparent');
    expect(style.borderLeftColor).toBe('transparent');
  });
});

describe('Blob', () => {
  it.each(['topRight', 'bottomLeft'] as const)('renders the %s variant at multiple sizes without throwing', (variant) => {
    SIZES.forEach((size) => {
      expect(() => renderSync(<Blob size={size} variant={variant} />)).not.toThrow();
    });
  });
});

describe('AppMark', () => {
  it('renders exactly 5 waveform bars', () => {
    SIZES.forEach((size) => {
      const renderer = renderSync(<AppMark size={size} testID="app-mark" />);
      const bars = [0, 1, 2, 3, 4].map((index) => renderer.root.findByProps({ testID: `app-mark-bar-${index}` }));
      expect(bars).toHaveLength(5);
    });
  });
});

describe('MicGlyph', () => {
  it('renders without throwing at multiple sizes', () => {
    SIZES.forEach((size) => {
      expect(() => renderSync(<MicGlyph size={size} color="#FFFFFF" />)).not.toThrow();
    });
  });
});

describe('OnboardingArt', () => {
  it('renders the phone, mic button and both cards at multiple sizes', () => {
    SIZES.forEach((size) => {
      const renderer = renderSync(<OnboardingArt size={size} testID="onboarding-art" />);
      expect(renderer.root.findByProps({ testID: 'onboarding-art-mic-button' })).toBeTruthy();
      expect(renderer.root.findByProps({ testID: 'onboarding-art-card-top' })).toBeTruthy();
      expect(renderer.root.findByProps({ testID: 'onboarding-art-card-bottom' })).toBeTruthy();
    });
  });
});

describe('MicPermissionArt', () => {
  it('renders the circle, rings, waves, tick and card at multiple sizes', () => {
    SIZES.forEach((size) => {
      const renderer = renderSync(<MicPermissionArt size={size} testID="permission-art" />);
      expect(renderer.root.findByProps({ testID: 'permission-art-circle' })).toBeTruthy();
      expect(renderer.root.findByProps({ testID: 'permission-art-ring-outer' })).toBeTruthy();
      expect(renderer.root.findByProps({ testID: 'permission-art-waves-left' })).toBeTruthy();
      expect(renderer.root.findByProps({ testID: 'permission-art-waves-right' })).toBeTruthy();
      expect(renderer.root.findByProps({ testID: 'permission-art-card' })).toBeTruthy();
      expect(renderer.root.findByProps({ testID: 'permission-art-tick' })).toBeTruthy();
    });
  });
});
