import TestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { SettingsAboutSection } from './settings-about-section';
import { ABOUT_MEETIO_ENTRIES } from '../../mocks';

const mockOnPrivacyPolicyPress = jest.fn();

function render() {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <SettingsAboutSection
        entries={ABOUT_MEETIO_ENTRIES}
        onPrivacyPolicyPress={mockOnPrivacyPolicyPress}
      />,
    );
  });
  return renderer;
}

describe('SettingsAboutSection', () => {
  beforeEach(() => {
    mockOnPrivacyPolicyPress.mockClear();
  });

  it('renders the "Về Meetio" heading and both link rows', () => {
    const renderer = render();
    const texts = renderer.root.findAllByType(Text).map((node) => node.props.children);
    expect(texts).toContain('Về Meetio');
    for (const entry of ABOUT_MEETIO_ENTRIES) {
      expect(texts).toContain(entry.label);
    }
  });

  it('"Chính sách bảo mật" is the only pressable row and fires onPrivacyPolicyPress', () => {
    const renderer = render();
    const pressableButtons = renderer.root.findAll(
      (node) => node.props.accessibilityRole === 'button' && typeof node.props.onPress === 'function',
    );
    expect(pressableButtons).toHaveLength(1);
    act(() => {
      pressableButtons[0]!.props.onPress();
    });
    expect(mockOnPrivacyPolicyPress).toHaveBeenCalledTimes(1);
  });

  it('"Điều khoản sử dụng" stays inert (no destination in the design)', () => {
    const renderer = render();
    const termsRow = renderer.root
      .findAll((node) => node.findAllByType(Text).some((t) => t.props.children === 'Điều khoản sử dụng'))
      .find((node) => node.props.accessibilityRole === 'button');
    expect(termsRow?.props.onPress).toBeUndefined();
  });
});
