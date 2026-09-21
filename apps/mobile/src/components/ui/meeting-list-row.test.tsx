import TestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { MeetingListRow } from './meeting-list-row';
import { InitialsAvatar } from './initials-avatar';
import { StatusBadge } from './status-badge';

function render(props: Parameters<typeof MeetingListRow>[0]) {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<MeetingListRow {...props} />);
  });
  return renderer;
}

describe('MeetingListRow', () => {
  it('renders title and meta', () => {
    const renderer = render({ leading: 'waveform', title: 'Sprint Review', meta: '42 phút · 12/05/2025' });
    const texts = renderer.root.findAllByType(Text).map((n) => n.props.children);
    expect(texts).toEqual(['Sprint Review', '42 phút · 12/05/2025']);
  });

  it('renders an InitialsAvatar for the avatar leading variant', () => {
    const renderer = render({ leading: 'avatar', avatarInitials: 'NA', title: 'x', meta: 'y' });
    expect(renderer.root.findAllByType(InitialsAvatar)).toHaveLength(1);
  });

  it('renders a StatusBadge when one is given', () => {
    const renderer = render({ leading: 'waveform', title: 'x', meta: 'y', badge: { status: 'done' } });
    expect(renderer.root.findByType(StatusBadge).props.status).toBe('done');
  });

  it('renders an optional snippet', () => {
    const renderer = render({ leading: 'waveform', title: 'x', meta: 'y', snippet: '...authentication và API...' });
    const texts = renderer.root.findAllByType(Text).map((n) => n.props.children);
    expect(texts).toContain('...authentication và API...');
  });

  it('calls onPress when tapped', () => {
    const onPress = jest.fn();
    const renderer = render({ leading: 'waveform', title: 'x', meta: 'y', onPress });
    act(() => {
      // react-native's Pressable is `React.memo(Pressable)`; react-test-renderer
      // flattens the memo wrapper, so `findByType(Pressable)` never matches —
      // locate it by the accessibility prop it always sets instead.
      renderer.root.findByProps({ accessibilityRole: 'button' }).props.onPress();
    });
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
