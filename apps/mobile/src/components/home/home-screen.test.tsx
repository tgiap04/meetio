import TestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';

/**
 * Exercises `app/(app)/(tabs)/index.tsx` without touching react-query or
 * expo-router. Lives here rather than beside the screen file itself because
 * `src/navigation/route-shape.test.ts` (P01, out of this phase's ownership)
 * asserts the exact `.tsx` file list inside `app/(app)/(tabs)/` — adding a
 * sibling `index.test.tsx` there breaks that assertion. Mock variables must
 * be prefixed with `mock` (case-insensitive) for Jest's out-of-scope check on
 * `jest.mock()` factories.
 */
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockPush(...args) },
}));

const mockUseMeQuery = jest.fn();
jest.mock('../../hooks/use-me-query', () => ({
  useMeQuery: (...args: unknown[]) => mockUseMeQuery(...args),
}));

import HomeScreen from '../../../app/(app)/(tabs)/index';
import { CONSENT_ROUTE, MEETING_DETAIL_ROUTE, RECORDING_SETUP_ROUTE, TAB_LIBRARY_ROUTE } from '../../navigation/app-routes';

function render() {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<HomeScreen />);
  });
  return renderer;
}

// react-native's Pressable renders three layers that all carry
// `accessibilityRole`; only the outermost also carries `onPress` as a
// function, so filtering on both gives exactly one match per pressable.
function findButton(renderer: TestRenderer.ReactTestRenderer, index = 0) {
  return renderer.root.findAll(
    (node) => node.props.accessibilityRole === 'button' && typeof node.props.onPress === 'function',
  )[index];
}

describe('(tabs)/index (Home) screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders LoadingState while /me is pending', () => {
    mockUseMeQuery.mockReturnValue({ isPending: true, isError: false });
    const renderer = render();
    expect(renderer.root.findByProps({ testID: 'loading-state' })).toBeTruthy();
  });

  it('renders ErrorState and retries on error', () => {
    const refetch = jest.fn();
    mockUseMeQuery.mockReturnValue({
      isPending: false,
      isError: true,
      error: new Error('network down'),
      refetch,
    });
    const renderer = render();
    expect(renderer.root.findByProps({ testID: 'error-state' })).toBeTruthy();
    act(() => {
      renderer.root.findByProps({ testID: 'error-state-retry' }).props.onPress();
    });
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('renders the greeting with the real display name and the three recent meetings', () => {
    mockUseMeQuery.mockReturnValue({
      isPending: false,
      isError: false,
      data: { user: { display_name: 'Nguyễn Văn Anh', recording_consent_at: null } },
    });
    const renderer = render();
    const texts = renderer.root.findAllByType(Text).map((node) => node.props.children).flat();
    expect(texts.join('')).toContain('Nguyễn Văn Anh');
    expect(texts).toContain('Sprint Review');
    expect(texts).toContain('Client Discussion');
    expect(texts).toContain('Project Planning');
  });

  it('routes the CTA to consent when consent has not been granted', () => {
    mockUseMeQuery.mockReturnValue({
      isPending: false,
      isError: false,
      data: { user: { display_name: 'Anh', recording_consent_at: null } },
    });
    const renderer = render();
    act(() => {
      findButton(renderer, 0).props.onPress();
    });
    expect(mockPush).toHaveBeenCalledWith(CONSENT_ROUTE);
  });

  it('routes the CTA to recording setup once consent is granted', () => {
    mockUseMeQuery.mockReturnValue({
      isPending: false,
      isError: false,
      data: { user: { display_name: 'Anh', recording_consent_at: '2026-01-01T00:00:00Z' } },
    });
    const renderer = render();
    act(() => {
      findButton(renderer, 0).props.onPress();
    });
    expect(mockPush).toHaveBeenCalledWith(RECORDING_SETUP_ROUTE);
  });

  it('routes "Xem tất cả" to the Thư viện tab', () => {
    mockUseMeQuery.mockReturnValue({
      isPending: false,
      isError: false,
      data: { user: { display_name: 'Anh', recording_consent_at: null } },
    });
    const renderer = render();
    act(() => {
      findButton(renderer, 1).props.onPress();
    });
    expect(mockPush).toHaveBeenCalledWith(TAB_LIBRARY_ROUTE);
  });

  it('routes a meeting row to meeting detail with that meeting id', () => {
    mockUseMeQuery.mockReturnValue({
      isPending: false,
      isError: false,
      data: { user: { display_name: 'Anh', recording_consent_at: null } },
    });
    const renderer = render();
    act(() => {
      findButton(renderer, 2).props.onPress();
    });
    expect(mockPush).toHaveBeenCalledWith({ pathname: MEETING_DETAIL_ROUTE, params: { id: 'sprint-review' } });
  });
});
