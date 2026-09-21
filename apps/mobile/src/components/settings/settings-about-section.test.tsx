import TestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { SettingsAboutSection } from './settings-about-section';
import { ABOUT_MEETIO_ENTRIES } from '../../mocks';

function render() {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<SettingsAboutSection entries={ABOUT_MEETIO_ENTRIES} />);
  });
  return renderer;
}

describe('SettingsAboutSection', () => {
  it('renders the "Về Meetio" heading and both link rows', () => {
    const renderer = render();
    const texts = renderer.root.findAllByType(Text).map((node) => node.props.children);
    expect(texts).toContain('Về Meetio');
    for (const entry of ABOUT_MEETIO_ENTRIES) {
      expect(texts).toContain(entry.label);
    }
  });

  it('renders both rows as inert (no onPress)', () => {
    const renderer = render();
    const pressableButtons = renderer.root.findAll(
      (node) => node.props.accessibilityRole === 'button' && typeof node.props.onPress === 'function',
    );
    expect(pressableButtons).toHaveLength(0);
  });
});
