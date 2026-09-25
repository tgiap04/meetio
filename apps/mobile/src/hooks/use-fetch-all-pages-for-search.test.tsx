import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { useFetchAllPagesForSearch, type UseFetchAllPagesForSearchOptions } from './use-fetch-all-pages-for-search';

let hookResult: boolean;

function Harness(props: UseFetchAllPagesForSearchOptions) {
  hookResult = useFetchAllPagesForSearch(props);
  return null;
}

const renderers: TestRenderer.ReactTestRenderer[] = [];

function render(props: UseFetchAllPagesForSearchOptions) {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<Harness {...props} />);
  });
  renderers.push(renderer);
  return renderer;
}

function baseProps(overrides: Partial<UseFetchAllPagesForSearchOptions> = {}): UseFetchAllPagesForSearchOptions {
  return {
    hasQuery: true,
    hasMatches: false,
    hasNextPage: true,
    isFetchingNextPage: false,
    fetchNextPage: jest.fn(),
    searchKey: 'ngân sách',
    ...overrides,
  };
}

describe('useFetchAllPagesForSearch', () => {
  afterEach(() => {
    while (renderers.length > 0) {
      act(() => renderers.pop()?.unmount());
    }
  });

  it('fetches the next page when a query has no matches yet and more pages remain', () => {
    const props = baseProps();
    render(props);
    expect(props.fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it('reports isSearchingAllPages as true while auto-fetching', () => {
    render(baseProps());
    expect(hookResult).toBe(true);
  });

  it('does not fetch when there is no active query', () => {
    const props = baseProps({ hasQuery: false });
    render(props);
    expect(props.fetchNextPage).not.toHaveBeenCalled();
    expect(hookResult).toBe(false);
  });

  it('does not fetch once a match has been found', () => {
    const props = baseProps({ hasMatches: true });
    render(props);
    expect(props.fetchNextPage).not.toHaveBeenCalled();
    expect(hookResult).toBe(false);
  });

  it('does not fetch when there is no next page', () => {
    const props = baseProps({ hasNextPage: false });
    render(props);
    expect(props.fetchNextPage).not.toHaveBeenCalled();
    expect(hookResult).toBe(false);
  });

  it('does not fetch again while a page is already loading', () => {
    const props = baseProps({ isFetchingNextPage: true });
    render(props);
    expect(props.fetchNextPage).not.toHaveBeenCalled();
    // Still reports "searching" so the UI keeps showing the indicator.
    expect(hookResult).toBe(true);
  });

  it('keeps fetching page after page as each one resolves with still no match', () => {
    const fetchNextPage = jest.fn();
    const renderer = render(baseProps({ fetchNextPage, isFetchingNextPage: true }));
    expect(fetchNextPage).not.toHaveBeenCalled();

    act(() => {
      renderer.update(<Harness {...baseProps({ fetchNextPage, isFetchingNextPage: false })} />);
    });
    expect(fetchNextPage).toHaveBeenCalledTimes(1);

    act(() => {
      renderer.update(<Harness {...baseProps({ fetchNextPage, isFetchingNextPage: true })} />);
    });
    act(() => {
      renderer.update(<Harness {...baseProps({ fetchNextPage, isFetchingNextPage: false })} />);
    });
    expect(fetchNextPage).toHaveBeenCalledTimes(2);
  });

  it('resets its fetch count and stops once a match appears', () => {
    const fetchNextPage = jest.fn();
    const renderer = render(baseProps({ fetchNextPage }));
    expect(fetchNextPage).toHaveBeenCalledTimes(1);

    act(() => {
      renderer.update(<Harness {...baseProps({ fetchNextPage, hasMatches: true })} />);
    });
    expect(fetchNextPage).toHaveBeenCalledTimes(1);
  });
});
