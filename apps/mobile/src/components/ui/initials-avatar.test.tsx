import TestRenderer, { act } from 'react-test-renderer';
import { Text, View } from 'react-native';
import { InitialsAvatar } from './initials-avatar';

function render(props: Parameters<typeof InitialsAvatar>[0]) {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<InitialsAvatar {...props} />);
  });
  return renderer;
}

describe('InitialsAvatar', () => {
  it('renders up to two uppercase initials', () => {
    const renderer = render({ initials: 'nguyễn văn anh' });
    expect(renderer.root.findByType(Text).props.children).toBe('NG');
  });

  it('renders without a halo by default', () => {
    const renderer = render({ initials: 'NA' });
    // Only one View (the circle) when there is no halo wrapper.
    expect(renderer.root.findAllByType(View)).toHaveLength(1);
  });

  it('wraps the circle in a halo ring when haloColor is set', () => {
    const renderer = render({ initials: 'NA', haloColor: '#F68001' });
    const views = renderer.root.findAllByType(View);
    expect(views).toHaveLength(2);
    expect(views[0].props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ borderColor: '#F68001' })]),
    );
  });
});
