import { useEffect, useState } from 'react';

/** Commits `value` only after it has stopped changing for `delayMs` — the
 *  Library search field's server-side query fires on the settled text, not
 *  on every keystroke. */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
