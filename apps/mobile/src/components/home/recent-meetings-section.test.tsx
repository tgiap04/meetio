import TestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import type { MeetingListItem } from '@meetio/shared';
import { RecentMeetingsSection } from './recent-meetings-section';

const MEETINGS: readonly MeetingListItem[] = [
  {
    id: 'sprint-review',
    title: 'Sprint Review',
    status: 'ready',
    source_language: 'vi',
    translate_to: null,
    started_at: '2026-01-12T09:00:00.000Z',
    ended_at: '2026-01-12T09:42:00.000Z',
    duration_sec: 2520,
    created_at: '2026-01-12T09:00:00.000Z',
  },
  {
    id: 'client-discussion',
    title: 'Client Discussion',
    status: 'processing',
    source_language: 'vi',
    translate_to: null,
    started_at: '2026-01-10T09:00:00.000Z',
    ended_at: '2026-01-10T09:28:00.000Z',
    duration_sec: 1680,
    created_at: '2026-01-10T09:00:00.000Z',
  },
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

  it('maps each meeting\'s server status onto its badge label', () => {
    const renderer = render();
    const texts = renderer.root.findAllByType(Text).map((node) => node.props.children);
    expect(texts).toContain('Đã xử lý');
    expect(texts).toContain('Đang xử lý');
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
