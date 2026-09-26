import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { searchTranscripts } from '../api/search';
import { useInfiniteSearchQuery } from './use-search-query';

jest.mock('../api/search', () => ({
  searchTranscripts: jest.fn(),
}));

const mockedSearchTranscripts = searchTranscripts as jest.Mock;

let hookResult: ReturnType<typeof useInfiniteSearchQuery>;
// Every harness writes the shared `hookResult`; one left mounted would overwrite it when its
// query settles late, so each test's harness is unmounted before the next one starts.
const mounted: TestRenderer.ReactTestRenderer[] = [];

function Harness({ q, enabled }: { q: string; enabled: boolean }) {
  hookResult = useInfiniteSearchQuery(q, enabled);
  return null;
}

function renderHarness(q: string, enabled: boolean) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <QueryClientProvider client={queryClient}>
        <Harness enabled={enabled} q={q} />
      </QueryClientProvider>,
    );
  });
  mounted.push(renderer);
  return renderer;
}

describe('useInfiniteSearchQuery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  afterEach(() => {
    act(() => mounted.splice(0).forEach((r) => r.unmount()));
  });

  it('does not call the API when disabled', () => {
    renderHarness('ngân sách', false);
    expect(mockedSearchTranscripts).not.toHaveBeenCalled();
    expect(hookResult.isPending).toBe(true);
  });

  it('fetches the first page with offset 0 when enabled', async () => {
    mockedSearchTranscripts.mockResolvedValue({ items: [{ chunk_id: 'c1' }], next_offset: 20 });
    await act(async () => {
      renderHarness('ngân sách', true);
    });
    expect(mockedSearchTranscripts).toHaveBeenCalledWith({ q: 'ngân sách', limit: 20, offset: 0 });
  });

  it('exposes hasNextPage false once the query settles with next_offset null', async () => {
    mockedSearchTranscripts.mockResolvedValue({ items: [], next_offset: null });
    renderHarness('x', true);
    // react-query commits through a macrotask (`setTimeout`), and under a busy full-suite run one
    // tick is not always enough — wait for the query to settle (bounded) instead of a fixed tick.
    for (let i = 0; i < 100 && !hookResult.isSuccess; i++) {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });
    }
    expect(hookResult.isSuccess).toBe(true);
    expect(hookResult.hasNextPage).toBe(false);
  });
});
