import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { ScrollView } from 'react-native';

/**
 * Proves the pager's completion contract from phase-06-onboarding-pager.md:
 * "Bắt đầu" advances pages 1→2→3 and completes only on page 3; "Bỏ qua"
 * completes from any page; every completion path flips the store flag
 * BEFORE navigating home. Follows the mocking pattern established in
 * `app-group-layout.test.tsx` — `expo-router` is mocked to bare `jest.fn()`s
 * so this renders without a real navigation stack, and this file stays out
 * of `app/` for the same CI reason documented there.
 */
const mockReplace = jest.fn();
const mockScrollTo = jest.fn();
const mockMarkOnboardingCompleted = jest.fn();

jest.mock('expo-router', () => ({
  router: { replace: (...args: unknown[]) => mockReplace(...args) },
}));

jest.mock('../store/preferences.store', () => ({
  usePreferencesStore: (selector: (state: { markOnboardingCompleted: () => void }) => unknown) =>
    selector({ markOnboardingCompleted: mockMarkOnboardingCompleted }),
}));

import OnboardingScreen from '../../app/onboarding';
import { OnboardingPage } from '../components/onboarding/onboarding-page';
import { ROOT_ROUTE } from './route-guards';

function renderScreen() {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<OnboardingScreen />);
  });
  return renderer;
}

function pressPrimary(renderer: TestRenderer.ReactTestRenderer) {
  const button = renderer.root.findByProps({ testID: 'onboarding-primary-button' });
  act(() => {
    button.props.onPress();
  });
}

/**
 * Đọc nhãn nút chính. Lọc theo `'label' in props` để lấy đúng composite
 * `PrimaryButton` — testID được truyền tiếp xuống `Pressable` và cả `View` host
 * bên dưới, nên `findByProps({testID})` có thể khớp nhiều node.
 */
function primaryLabel(renderer: TestRenderer.ReactTestRenderer): string {
  const matches = renderer.root
    .findAllByProps({ testID: 'onboarding-primary-button' })
    .filter((node) => 'label' in node.props);
  return matches[matches.length - 1].props.label;
}

function pressSkip(renderer: TestRenderer.ReactTestRenderer) {
  const skip = renderer.root.findByProps({ testID: 'onboarding-skip-button' });
  act(() => {
    skip.props.onPress();
  });
}

function scrollToPage(renderer: TestRenderer.ReactTestRenderer, index: number) {
  const scrollView = renderer.root.findByType(ScrollView);
  const width = renderer.root.findAllByType(OnboardingPage)[0].props.width;
  act(() => {
    scrollView.props.onMomentumScrollEnd({
      nativeEvent: { contentOffset: { x: index * width } },
    });
  });
}

describe('OnboardingScreen', () => {
  beforeEach(() => {
    mockReplace.mockClear();
    mockScrollTo.mockClear();
    mockMarkOnboardingCompleted.mockClear();
    // ScrollView.scrollTo is a native method not implemented in the test
    // renderer; stub it so `ref.current?.scrollTo` doesn't throw.
    ScrollView.prototype.scrollTo = mockScrollTo;
  });

  it('says "Tiếp tục" while there are pages left, and "Bắt đầu" only on the last', () => {
    // The label used to be hardcoded to "Bắt đầu" on every page, matching
    // design.png — which draws page 1 of 3 with that label. But on pages 1 and
    // 2 the button only scrolls to the next page, so the label promised
    // something the button did not do. A deliberate deviation from the design;
    // see the note beside PRIMARY_LABEL_ADVANCE in app/onboarding.tsx.
    const renderer = renderScreen();
    expect(primaryLabel(renderer)).toBe('Tiếp tục');

    scrollToPage(renderer, 1);
    expect(primaryLabel(renderer)).toBe('Tiếp tục');

    scrollToPage(renderer, 2);
    expect(primaryLabel(renderer)).toBe('Bắt đầu');
  });

  it('goes back to "Tiếp tục" when the user swipes back from the last page', () => {
    // Swiping is not one-way. A label derived from state rather than set once
    // has to survive going backwards too.
    const renderer = renderScreen();
    scrollToPage(renderer, 2);
    scrollToPage(renderer, 1);

    expect(primaryLabel(renderer)).toBe('Tiếp tục');
  });

  it('advances instead of completing when the primary button is pressed on page 1', () => {
    const renderer = renderScreen();

    pressPrimary(renderer);

    expect(mockScrollTo).toHaveBeenCalled();
    expect(mockMarkOnboardingCompleted).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('completes and replaces to "/" when "Bắt đầu" is pressed on page 3', () => {
    const renderer = renderScreen();

    scrollToPage(renderer, 2);
    pressPrimary(renderer);

    expect(mockMarkOnboardingCompleted).toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith(ROOT_ROUTE);
    expect(mockMarkOnboardingCompleted.mock.invocationCallOrder[0]).toBeLessThan(
      mockReplace.mock.invocationCallOrder[0],
    );
  });

  it('completes from page 1 when "Bỏ qua" is pressed', () => {
    const renderer = renderScreen();

    pressSkip(renderer);

    expect(mockMarkOnboardingCompleted).toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith('/');
    expect(mockMarkOnboardingCompleted.mock.invocationCallOrder[0]).toBeLessThan(
      mockReplace.mock.invocationCallOrder[0],
    );
  });
});
