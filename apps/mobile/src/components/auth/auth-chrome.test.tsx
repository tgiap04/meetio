import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ReactElement } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import {
  ActivityIndicator,
  Dimensions,
  Image,
  KeyboardAvoidingView,
  ScrollView,
  Text,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { AuthDivider } from './auth-divider';
import { AuthScreenShell } from './auth-screen-shell';
import { GoogleSignInButton } from './google-sign-in-button';
import { colors } from '../../theme/colors';
import { isRenderableVietnameseText } from '../../theme/typography';

/** One combined suite for the three phase-05 chrome components, following the
 *  precedent set by `illustrations.test.tsx`. */
function renderSync(element: ReactElement): TestRenderer.ReactTestRenderer {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(element);
  });
  return renderer;
}

/** Only the host element has resolved styles; above it `style` is still a function. */
function hostWith(renderer: TestRenderer.ReactTestRenderer, props: Record<string, unknown>) {
  const [host] = renderer.root.findAllByProps(props).filter((n) => typeof n.type === 'string');
  expect(host).toBeTruthy();
  return host;
}

/** `Pressable` is `React.memo(Pressable)` and react-test-renderer flattens the memo
 *  wrapper, so `findByType(Pressable)` never matches — search by a prop instead. The
 *  composite keeps `disabled`; RN turns it into responder handlers below that. */
const pressableHost = (r: TestRenderer.ReactTestRenderer) =>
  hostWith(r, { accessibilityRole: 'button' });
const pressableElement = (r: TestRenderer.ReactTestRenderer) =>
  r.root.findAllByProps({ accessibilityRole: 'button' })[0];

function flatten(style: unknown): Record<string, unknown> {
  if (Array.isArray(style)) return Object.assign({}, ...style.map(flatten));
  return (style as Record<string, unknown>) ?? {};
}

/** `useWindowDimensions` seeds from `Dimensions.get('window')`, so spying on that
 *  public API sets the viewport without mocking react-native wholesale. */
function renderShell(width: number, props: Partial<{ subtitle: string; testID: string }> = {}) {
  jest.spyOn(Dimensions, 'get').mockReturnValue({ width, height: 844, scale: 3, fontScale: 1 });
  return renderSync(
    <AuthScreenShell title="Đăng nhập" {...props}>
      <Text>form</Text>
    </AuthScreenShell>,
  );
}

const countOf = (r: TestRenderer.ReactTestRenderer, testID: string) =>
  r.root.findAllByProps({ testID }).length;

afterEach(() => jest.restoreAllMocks());

describe('AuthScreenShell', () => {
  it('lays the peach backdrop of screens 1-3 behind the content', () => {
    const renderer = renderShell(390);
    expect(countOf(renderer, 'auth-backdrop-top')).toBeGreaterThan(0);
    expect(countOf(renderer, 'auth-backdrop-bottom')).toBeGreaterThan(0);
  });

  it('scales the backdrop with the screen width rather than a fixed size', () => {
    const narrow = renderShell(320).root.findAllByProps({ testID: 'auth-backdrop-top' })[0];
    const wide = renderShell(430).root.findAllByProps({ testID: 'auth-backdrop-top' })[0];
    expect(narrow.props.size).toBeGreaterThan(0);
    expect(wide.props.size).toBeGreaterThan(narrow.props.size);
  });

  it('renders the brand lockup, the title and the form slot', () => {
    const renderer = renderShell(390);
    const texts = renderer.root.findAllByType(Text).map((node) => node.props.children);
    expect(countOf(renderer, 'auth-mark')).toBeGreaterThan(0);
    expect(renderer.root.findByProps({ testID: 'auth-title' }).props.children).toBe('Đăng nhập');
    expect(texts).toContain('Meetio');
    expect(texts).toContain('form');
  });

  it('renders the subtitle only when one is given, and forwards its own testID', () => {
    expect(countOf(renderShell(390), 'auth-subtitle')).toBe(0);

    const withSubtitle = renderShell(390, { subtitle: 'Tiếp tục ghi âm.', testID: 'login-shell' });
    expect(withSubtitle.root.findByProps({ testID: 'auth-subtitle' }).props.children).toBe(
      'Tiếp tục ghi âm.',
    );
    expect(countOf(withSubtitle, 'login-shell')).toBeGreaterThan(0);
  });

  it('keeps the form reachable with the keyboard up, without trapping it open', () => {
    const renderer = renderShell(390);
    const scroller = renderer.root.findByType(ScrollView);
    // jest-expo reports Platform.OS === 'ios'.
    expect(renderer.root.findByType(KeyboardAvoidingView).props.behavior).toBe('padding');
    // "always" would hold the keyboard through every touch and make a mis-tap on
    // the submit button easy — see the phase file's security note.
    expect(scroller.props.keyboardShouldPersistTaps).toBe('handled');
    expect(flatten(scroller.props.contentContainerStyle).flexGrow).toBe(1);
  });
});

describe('GoogleSignInButton', () => {
  it('shows the official Google G mark rather than a hand-drawn approximation', () => {
    const mark = renderSync(<GoogleSignInButton onPress={() => {}} />).root.findByType(Image);
    expect(mark.props.source).toBeTruthy();
    expect(flatten(mark.props.style).width).toBe(20);
  });

  it('reads as a secondary action — no brand fill, no gradient, 44pt clear', () => {
    const renderer = renderSync(<GoogleSignInButton onPress={() => {}} testID="google" />);
    const style = flatten(pressableHost(renderer).props.style);
    expect(style.backgroundColor).toBe(colors.background);
    expect(style.backgroundColor).not.toBe(colors.primary);
    expect(renderer.root.findAllByType(LinearGradient)).toHaveLength(0);
    expect(style.minHeight as number).toBeGreaterThanOrEqual(44);
  });

  it('blocks onPress at the responder level when disabled', () => {
    // Pressable.disabled is what actually stops the touch responder from firing
    // onPress; invoking props.onPress by hand would bypass it and prove nothing.
    const renderer = renderSync(<GoogleSignInButton onPress={jest.fn()} disabled testID="g" />);
    expect(pressableElement(renderer).props.disabled).toBe(true);
    expect(pressableHost(renderer).props.accessibilityState).toEqual({
      disabled: true,
      busy: false,
    });
    expect(flatten(pressableHost(renderer).props.style).opacity).toBe(0.5);
  });

  it('swaps the label for a spinner while loading, and keeps its accessible name', () => {
    const renderer = renderSync(<GoogleSignInButton onPress={() => {}} loading testID="g" />);
    expect(renderer.root.findByType(ActivityIndicator)).toBeTruthy();
    expect(renderer.root.findAllByType(Text)).toHaveLength(0);
    expect(renderer.root.findAllByType(Image)).toHaveLength(0);
    expect(pressableElement(renderer).props.disabled).toBe(true);
    expect(pressableHost(renderer).props.accessibilityState).toEqual({
      disabled: true,
      busy: true,
    });
    // The visible label is gone, so the name has to come from the prop.
    expect(pressableHost(renderer).props.accessibilityLabel).toBe('Tiếp tục với Google');
  });
});

describe('AuthDivider', () => {
  it('defaults to "hoặc" and flanks it with two rules', () => {
    const renderer = renderSync(<AuthDivider testID="divider" />);
    const label = renderer.root.findByType(Text);
    expect(label.props.children).toBe('hoặc');
    expect(flatten(label.props.style).color).toBe(colors.textMuted);
    expect(hostWith(renderer, { testID: 'divider' }).props.children).toHaveLength(3);
  });

  it('honours a caller-supplied label', () => {
    const renderer = renderSync(<AuthDivider label="hoặc đăng nhập bằng" />);
    expect(renderer.root.findByType(Text).props.children).toBe('hoặc đăng nhập bằng');
  });
});

describe('phase 05 chrome, as source', () => {
  const COMPONENTS = ['auth-screen-shell.tsx', 'google-sign-in-button.tsx', 'auth-divider.tsx'];
  const read = (name: string) => readFileSync(join(__dirname, name), 'utf8');

  /**
   * Acceptance criterion #7, runnable in CI rather than by hand: track A stays
   * independent of track B only while nothing here reaches for routing, global
   * state, the query client, or the native Google module. Held as prefixes on
   * purpose — the phase states the criterion as a `grep -E` over this whole
   * directory, so full package names here would trip its own command. A prefix
   * is strictly more sensitive than the full name, so nothing is lost.
   */
  const FORBIDDEN = ['expo-rout', 'zustan', '@tanstac', 'google-signi'];

  it.each(COMPONENTS)('%s pulls in no router, store, query client or native module', (name) => {
    FORBIDDEN.forEach((fragment) => expect(read(name)).not.toContain(fragment));
  });

  // Acceptance criterion #8 — the repo's 200-line ceiling, this file included.
  it.each([...COMPONENTS, 'auth-chrome.test.tsx'])('%s stays under 200 lines', (name) => {
    expect(read(name).split('\n').length).toBeLessThan(200);
  });

  it('ships only Vietnamese copy the system fonts are known to render', () => {
    ['Tiếp tục với Google', 'hoặc', 'Meetio', 'Đăng nhập'].forEach((copy) =>
      expect(isRenderableVietnameseText(copy)).toBe(true),
    );
  });
});
