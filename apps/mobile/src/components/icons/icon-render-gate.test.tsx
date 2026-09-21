import TestRenderer, { act } from 'react-test-renderer';
import { Feather } from '@expo/vector-icons';

/**
 * Throwaway measurement gate, per phase-01 Step 1. Proves `@expo/vector-icons`
 * renders under Jest before anything depends on it. If this ever goes red,
 * work the ordered fallbacks in the phase file (widen
 * `transformIgnorePatterns` -> local `jest.mock` -> hand-rolled mock in
 * `jest.setup.ts`) before touching `AppIcon` or any primitive.
 */
describe('@expo/vector-icons render gate', () => {
  it('renders a Feather icon under react-test-renderer', () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<Feather name="mic" size={24} />);
    });
    expect(renderer.root.findAllByType(Feather)).toHaveLength(1);
  });
});
