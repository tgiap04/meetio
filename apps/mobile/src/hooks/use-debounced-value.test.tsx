import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { useDebouncedValue } from './use-debounced-value';

let latest: string;

function Harness({ value, delayMs }: { value: string; delayMs: number }) {
  latest = useDebouncedValue(value, delayMs);
  return null;
}

describe('useDebouncedValue', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns the initial value immediately', () => {
    act(() => {
      TestRenderer.create(<Harness delayMs={300} value="a" />);
    });
    expect(latest).toBe('a');
  });

  it('holds the old value until the delay elapses, then commits the latest one', () => {
    let renderer: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<Harness delayMs={300} value="a" />);
    });

    act(() => {
      renderer.update(<Harness delayMs={300} value="ab" />);
    });
    expect(latest).toBe('a');

    act(() => {
      jest.advanceTimersByTime(299);
    });
    expect(latest).toBe('a');

    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(latest).toBe('ab');
  });

  it('resets the timer on every keystroke so only the final value ever commits', () => {
    let renderer: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<Harness delayMs={300} value="a" />);
    });

    act(() => {
      renderer.update(<Harness delayMs={300} value="ab" />);
    });
    act(() => {
      jest.advanceTimersByTime(200);
    });
    act(() => {
      renderer.update(<Harness delayMs={300} value="abc" />);
    });
    act(() => {
      jest.advanceTimersByTime(200);
    });
    expect(latest).toBe('a');

    act(() => {
      jest.advanceTimersByTime(100);
    });
    expect(latest).toBe('abc');
  });
});
