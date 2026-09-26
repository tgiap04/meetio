import TestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AskScreen from '../../app/(app)/ask';

/**
 * Exercises `app/(app)/ask.tsx`. Lives here rather than beside the screen
 * file itself because `src/navigation/route-shape.test.ts` asserts no
 * `*.test.tsx` lives anywhere under `app/` — same convention as
 * `actions-screen.test.tsx` next to it.
 */
const mockPush = jest.fn();
const mockBack = jest.fn();
const mockUseLocalSearchParams = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockPush(...args), back: (...args: unknown[]) => mockBack(...args) },
  useLocalSearchParams: () => mockUseLocalSearchParams(),
}));

const mockUseGlobalQaHistoryQuery = jest.fn();
jest.mock('../hooks/use-qa-history-query', () => {
  const actual = jest.requireActual('../hooks/use-qa-history-query');
  return {
    ...actual,
    useGlobalQaHistoryQuery: (...args: unknown[]) => mockUseGlobalQaHistoryQuery(...args),
  };
});

const mockAskMutateAsync = jest.fn();
const mockDeleteMutateAsync = jest.fn();
jest.mock('../hooks/use-qa-mutations', () => ({
  useAskGlobalQuestionMutation: () => ({ mutateAsync: mockAskMutateAsync, isPending: false }),
  useDeleteGlobalQaHistoryMutation: () => ({ mutateAsync: mockDeleteMutateAsync, isPending: false }),
}));

function qaMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: 'm1',
    role: 'user',
    content: 'x',
    citations: [],
    confidence: null,
    not_found: false,
    low_confidence: false,
    filters: null,
    created_at: '2026-05-01T00:00:00.000Z',
    ...overrides,
  };
}

function mockHistorySuccess(items: ReturnType<typeof qaMessage>[]) {
  mockUseGlobalQaHistoryQuery.mockReturnValue({
    isPending: false,
    isError: false,
    data: { pages: [{ items, next_before: null }] },
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: jest.fn(),
    refetch: jest.fn(),
  });
}

let activeRenderer: TestRenderer.ReactTestRenderer | undefined;

function render() {
  // `QaEntityFilterPicker` (rendered inside the filter bar) uses a real
  // TanStack Query hook (`useEntitySearchQuery`), unlike the rest of this
  // screen's data hooks, which are mocked above — it needs a real provider.
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  act(() => {
    activeRenderer = TestRenderer.create(
      <QueryClientProvider client={client}>
        <AskScreen />
      </QueryClientProvider>,
    );
  });
  return activeRenderer!;
}

function allTexts(renderer: TestRenderer.ReactTestRenderer) {
  return renderer.root.findAllByType(Text).map((node) => node.props.children).flat();
}

describe('AskScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseLocalSearchParams.mockReturnValue({});
    mockAskMutateAsync.mockResolvedValue({
      question: qaMessage({ id: 'q1' }),
      answer: qaMessage({ id: 'a1', role: 'assistant' }),
    });
  });

  afterEach(() => {
    act(() => activeRenderer?.unmount());
    activeRenderer = undefined;
  });

  it('sends a plain question with no filters when none is set', () => {
    mockHistorySuccess([]);
    const renderer = render();
    act(() => {
      renderer.root.findByProps({ testID: 'qa-composer-input' }).props.onChangeText('Ai phụ trách API?');
    });
    act(() => {
      renderer.root.findByProps({ testID: 'qa-composer-send' }).props.onPress();
    });
    expect(mockAskMutateAsync).toHaveBeenCalledWith({
      question: 'Ai phụ trách API?',
      from: undefined,
      to: undefined,
      entity_id: undefined,
    });
  });

  it('preselects the entity filter when opened from entity detail (bar starts expanded)', () => {
    mockUseLocalSearchParams.mockReturnValue({ entityId: 'e1', entityName: 'Bình' });
    mockHistorySuccess([]);
    const renderer = render();
    const chip = renderer.root.findByProps({ testID: 'qa-entity-filter-selected' });
    expect(chip.findByType(Text).props.children.join('')).toBe('Bình ✕');
  });

  it('sends the preselected entity filter with the question', () => {
    mockUseLocalSearchParams.mockReturnValue({ entityId: 'e1', entityName: 'Bình' });
    mockHistorySuccess([]);
    const renderer = render();
    act(() => {
      renderer.root.findByProps({ testID: 'qa-composer-input' }).props.onChangeText('Hỏi về Bình');
    });
    act(() => {
      renderer.root.findByProps({ testID: 'qa-composer-send' }).props.onPress();
    });
    expect(mockAskMutateAsync).toHaveBeenCalledWith({
      question: 'Hỏi về Bình',
      from: undefined,
      to: undefined,
      entity_id: 'e1',
    });
  });

  it('renders a past question with its filter chips', () => {
    mockHistorySuccess([
      qaMessage({
        id: 'q1',
        content: 'Việc của dự án X?',
        filters: { from: '2026-05-01T00:00:00.000Z', to: null, entity_id: 'e1', entity_name: 'Dự án X' },
      }),
    ]);
    const renderer = render();
    expect(allTexts(renderer)).toContain('Dự án X');
  });
});
