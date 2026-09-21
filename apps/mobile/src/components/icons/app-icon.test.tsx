import TestRenderer, { act } from 'react-test-renderer';
import { Feather } from '@expo/vector-icons';
import { AppIcon, APP_ICON_NAMES } from './app-icon';

// Derived from the facade's own glyph map, never re-listed here. A hardcoded
// copy drifts the moment a name is added, and would pass while leaving the new
// icon unrendered by any test.
const ALL_NAMES = APP_ICON_NAMES;

function render(props: Parameters<typeof AppIcon>[0]) {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<AppIcon {...props} />);
  });
  return renderer;
}

describe('AppIcon', () => {
  it('maps every semantic name to a real Feather glyph', () => {
    for (const name of ALL_NAMES) {
      const renderer = render({ name });
      expect(renderer.root.findAllByType(Feather)).toHaveLength(1);
    }
  });

  it('passes size and color through to the underlying glyph', () => {
    const renderer = render({ name: 'home', size: 32, color: '#F68001' });
    const icon = renderer.root.findByType(Feather);
    expect(icon.props.size).toBe(32);
    expect(icon.props.color).toBe('#F68001');
  });

  it('forwards testID', () => {
    const renderer = render({ name: 'search', testID: 'search-icon' });
    expect(renderer.root.findByProps({ testID: 'search-icon' })).toBeTruthy();
  });
});
