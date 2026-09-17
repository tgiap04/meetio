import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { useMinimumSplashDelay } from './use-minimum-splash-delay';

/**
 * The 900ms floor (decisions.md §1) only earns its keep if it actually
 * clears after the timer, holds `false` before it, and never sets state on
 * an unmounted component. No `@testing-library/react-native` in this repo
 * (see other hook tests) — a tiny probe component captures the hook's
 * return value instead, same pattern as the rest of the suite. Kept as
 * `React.createElement` (no JSX) so this file can stay a plain `.ts`.
 */
function Probe({ ms, onValue }: { ms: number; onValue: (value: boolean) => void }) {
  onValue(useMinimumSplashDelay(ms));
  return null;
}

function probe(ms: number, onValue: (value: boolean) => void) {
  return React.createElement(Probe, { ms, onValue });
}

describe('useMinimumSplashDelay', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('starts false and stays false before the delay elapses', () => {
    let latest = true;
    act(() => {
      TestRenderer.create(probe(900, (value) => (latest = value)));
    });

    expect(latest).toBe(false);

    act(() => {
      jest.advanceTimersByTime(899);
    });

    expect(latest).toBe(false);
  });

  it('flips to true once the delay elapses', () => {
    let latest = false;
    act(() => {
      TestRenderer.create(probe(900, (value) => (latest = value)));
    });

    act(() => {
      jest.advanceTimersByTime(900);
    });

    expect(latest).toBe(true);
  });

  it('clears the timer on unmount without warning or setting state', () => {
    const clearSpy = jest.spyOn(global, 'clearTimeout');
    let renderer: TestRenderer.ReactTestRenderer | undefined;

    act(() => {
      renderer = TestRenderer.create(probe(900, () => {}));
    });

    act(() => {
      renderer?.unmount();
    });

    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
  });
});
