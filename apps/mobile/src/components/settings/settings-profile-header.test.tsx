import TestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { SettingsProfileHeader } from './settings-profile-header';

function render(props: Parameters<typeof SettingsProfileHeader>[0]) {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<SettingsProfileHeader {...props} />);
  });
  return renderer;
}

describe('SettingsProfileHeader', () => {
  it('renders the real display name and email', () => {
    const renderer = render({ displayName: 'Nguyễn Văn Anh', email: 'anh.nguyen@meetio.app' });
    const texts = renderer.root.findAllByType(Text).map((node) => node.props.children);
    expect(texts).toContain('Nguyễn Văn Anh');
    expect(texts).toContain('anh.nguyen@meetio.app');
  });

  it('derives avatar initials from the display name', () => {
    const renderer = render({ displayName: 'Nguyễn Văn Anh', email: 'anh.nguyen@meetio.app' });
    const texts = renderer.root.findAllByType(Text).map((node) => node.props.children);
    expect(texts).toContain('NA');
  });
});
