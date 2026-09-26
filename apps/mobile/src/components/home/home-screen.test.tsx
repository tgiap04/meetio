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

const RECENT_ITEMS = [
  { id: 'sprint-review', title: 'Sprint Review', status: 'ready', source_language: 'vi', translate_to: null, started_at: '2026-01-12T09:00:00.000Z', ended_at: null, duration_sec: 2520, created_at: '2026-01-12T09:00:00.000Z' },
  { id: 'client-discussion', title: 'Client Discussion', status: 'ready', source_language: 'vi', translate_to: null, started_at: '2026-01-10T09:00:00.000Z', ended_at: null, duration_sec: 1680, created_at: '2026-01-10T09:00:00.000Z' },
  { id: 'project-planning', title: 'Project Planning', status: 'processing', source_language: 'vi', translate_to: null, started_at: '2026-01-09T09:00:00.000Z', ended_at: null, duration_sec: 900, created_at: '2026-01-09T09:00:00.000Z' },
];

const mockUseRecentMeetingsQuery = jest.fn();
jest.mock('../../hooks/use-recent-meetings-query', () => ({
  useRecentMeetingsQuery: (...args: unknown[]) => mockUseRecentMeetingsQuery(...args),
}));

const mockUseActionFiltersQuery = jest.fn();
jest.mock('../../hooks/use-action-filters-query', () => ({
  useActionFiltersQuery: (...args: unknown[]) => mockUseActionFiltersQuery(...args),
}));

import HomeScreen from '../../../app/(app)/(tabs)/index';
import {
  ACTIONS_ROUTE,
  CONSENT_ROUTE,
  MEETING_DETAIL_ROUTE,
  RECORDING_SETUP_ROUTE,
  TAB_LIBRARY_ROUTE,
} from '../../navigation/app-routes';

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
    mockUseRecentMeetingsQuery.mockReturnValue({ data: { items: RECENT_ITEMS, next_cursor: null } });
    mockUseActionFiltersQuery.mockReturnValue({
      data: { open_total: 3, assignees: [], meetings: [] },
    });
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

  it('renders the greeting with the real display name and the real recent meetings', () => {
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

  it('falls back to an empty recent-meetings list while that query has no data yet', () => {
    mockUseRecentMeetingsQuery.mockReturnValue({ data: undefined });
    mockUseMeQuery.mockReturnValue({
      isPending: false,
      isError: false,
      data: { user: { display_name: 'Anh', recording_consent_at: null } },
    });
    expect(() => render()).not.toThrow();
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
      findButton(renderer, 2).props.onPress();
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
      findButton(renderer, 3).props.onPress();
    });
    expect(mockPush).toHaveBeenCalledWith({ pathname: MEETING_DETAIL_ROUTE, params: { id: 'sprint-review' } });
  });

  it('shows the sum of open_count in the "Việc cần làm" row label', () => {
    mockUseMeQuery.mockReturnValue({
      isPending: false,
      isError: false,
      data: { user: { display_name: 'Anh', recording_consent_at: null } },
    });
    const renderer = render();
    const texts = renderer.root.findAllByType(Text).map((node) => node.props.children).flat().join('');
    expect(texts).toContain('Việc cần làm · 3 đang mở');
  });

  it('routes the "Việc cần làm" row to the actions screen', () => {
    mockUseMeQuery.mockReturnValue({
      isPending: false,
      isError: false,
      data: { user: { display_name: 'Anh', recording_consent_at: null } },
    });
    const renderer = render();
    act(() => {
      findButton(renderer, 1).props.onPress();
    });
    expect(mockPush).toHaveBeenCalledWith(ACTIONS_ROUTE);
  });
});
