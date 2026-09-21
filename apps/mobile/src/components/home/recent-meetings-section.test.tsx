import TestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { RecentMeetingsSection } from './recent-meetings-section';
import type { Meeting } from '../../mocks/types';

const MEETINGS: readonly Meeting[] = [
  { id: 'sprint-review', title: 'Sprint Review', durationMinutes: 42, date: '12/05/2025', status: 'done', initials: 'SR' },
  { id: 'client-discussion', title: 'Client Discussion', durationMinutes: 28, date: '10/05/2025', status: 'done', initials: 'CD' },
];

function render(onViewAllPress = jest.fn(), onMeetingPress = jest.fn()) {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <RecentMeetingsSection meetings={MEETINGS} onMeetingPress={onMeetingPress} onViewAllPress={onViewAllPress} />,
    );
  });
  return renderer;
}

describe('RecentMeetingsSection', () => {
  it('renders the heading and every meeting title', () => {
    const renderer = render();
    const texts = renderer.root.findAllByType(Text).map((node) => node.props.children);
    expect(texts).toContain('Cuộc họp gần đây');
    expect(texts).toContain('Sprint Review');
    expect(texts).toContain('Client Discussion');
  });

  // react-native's Pressable renders three layers that all carry
  // `accessibilityRole`; only the outermost also carries `onPress` as a
  // function, so filtering on both gives exactly one match per pressable.
  function findButtons(renderer: TestRenderer.ReactTestRenderer) {
    return renderer.root.findAll(
      (node) => node.props.accessibilityRole === 'button' && typeof node.props.onPress === 'function',
    );
  }

  it('calls onViewAllPress when "Xem tất cả" is tapped', () => {
    const onViewAllPress = jest.fn();
    const renderer = render(onViewAllPress);
    act(() => {
      findButtons(renderer)[0].props.onPress();
    });
    expect(onViewAllPress).toHaveBeenCalledTimes(1);
  });

  it('calls onMeetingPress with the tapped meeting id', () => {
    const onMeetingPress = jest.fn();
    const renderer = render(jest.fn(), onMeetingPress);
    act(() => {
      findButtons(renderer)[2].props.onPress();
    });
    expect(onMeetingPress).toHaveBeenCalledWith('client-discussion');
  });
});
