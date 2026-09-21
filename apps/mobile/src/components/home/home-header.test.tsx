import TestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { HomeHeader } from './home-header';

function render(displayName: string) {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<HomeHeader displayName={displayName} />);
  });
  return renderer;
}

describe('HomeHeader', () => {
  it('renders the wordmark and the greeting with the given display name', () => {
    const renderer = render('Nguyễn Văn Anh');
    const texts = renderer.root.findAllByType(Text).map((node) => node.props.children).flat();
    expect(texts).toContain('Meetio');
    expect(texts.join('')).toContain('Nguyễn Văn Anh');
  });

  it('renders the static subtitle paragraph', () => {
    const renderer = render('Anh');
    const texts = renderer.root.findAllByType(Text).map((node) => node.props.children).flat();
    expect(texts.join('')).toContain('Ghi âm cuộc họp, nhận diện, dịch thuật');
  });

  it('renders the crown badge as decorative, not a button', () => {
    const renderer = render('Anh');
    expect(renderer.root.findAllByProps({ accessibilityRole: 'button' })).toHaveLength(0);
    expect(renderer.root.findByProps({ accessibilityLabel: 'Tài khoản cao cấp' })).toBeTruthy();
  });
});
