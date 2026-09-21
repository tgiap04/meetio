import TestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { ScreenHeader } from './screen-header';

// react-native's Pressable is `React.memo(Pressable)`; react-test-renderer flattens
// the memo wrapper, so `findByType(Pressable)` never matches. Locate it by the
// accessibility props the component always sets instead (same convention as
// `primary-button.test.tsx`). `@expo/vector-icons` also renders its glyph as a
// `Text` node, so text assertions filter to string children only.
function findPressable(renderer: TestRenderer.ReactTestRenderer) {
  return renderer.root.findByProps({ accessibilityRole: 'button' });
}

function stringTexts(renderer: TestRenderer.ReactTestRenderer) {
  return renderer.root
    .findAllByType(Text)
    .map((n) => n.props.children)
    .filter((c): c is string => typeof c === 'string' && c.length > 0);
}

function render(props: Parameters<typeof ScreenHeader>[0]) {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<ScreenHeader {...props} />);
  });
  return renderer;
}

describe('ScreenHeader', () => {
  it('renders the title', () => {
    const renderer = render({ title: 'Cài đặt ghi âm', onBack: jest.fn() });
    expect(stringTexts(renderer)).toContain('Cài đặt ghi âm');
  });

  it('calls onBack when the chevron is pressed', () => {
    const onBack = jest.fn();
    const renderer = render({ title: 'Transcript', onBack });
    act(() => {
      findPressable(renderer).props.onPress();
    });
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('renders an optional trailing slot', () => {
    const renderer = render({
      title: 'Transcript',
      onBack: jest.fn(),
      trailing: <Text>edit</Text>,
    });
    expect(stringTexts(renderer)).toContain('edit');
  });
});
