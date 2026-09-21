import TestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { SettingsRow } from './settings-row';

// `@expo/vector-icons` renders its glyph as a `Text` node too, so text
// assertions filter to string children only. Pressable is located by its
// accessibility props — see `primary-button.test.tsx` for why.
function stringTexts(renderer: TestRenderer.ReactTestRenderer) {
  return renderer.root
    .findAllByType(Text)
    .map((n) => n.props.children)
    .filter((c): c is string => typeof c === 'string' && c.length > 0);
}

describe('SettingsRow', () => {
  it('renders the label and value', () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<SettingsRow icon="language" label="Ngôn ngữ" value="Tiếng Việt" />);
    });
    expect(stringTexts(renderer)).toEqual(['Ngôn ngữ', 'Tiếng Việt']);
  });

  it('omits the value text when none is given', () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<SettingsRow icon="shield" label="Chính sách bảo mật" />);
    });
    expect(stringTexts(renderer)).toEqual(['Chính sách bảo mật']);
  });

  it('calls onPress when tapped', () => {
    const onPress = jest.fn();
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<SettingsRow icon="storage" label="Lưu trữ" onPress={onPress} />);
    });
    act(() => {
      renderer.root.findByProps({ accessibilityRole: 'button' }).props.onPress();
    });
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
