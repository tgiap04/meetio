import TestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import type { EntityMeeting } from '@meetio/shared';
import { EntityMeetingsList } from './entity-meetings-list';

const MEETINGS: readonly EntityMeeting[] = [
  { id: 'm1', title: 'Sprint Review', started_at: '2026-01-15T09:00:00.000Z', mention_count: 3 },
];

function render(meetings: readonly EntityMeeting[], onMeetingPress = jest.fn()) {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<EntityMeetingsList meetings={meetings} onMeetingPress={onMeetingPress} />);
  });
  return renderer;
}

describe('EntityMeetingsList', () => {
  it('renders nothing for an empty list', () => {
    const renderer = render([]);
    expect(renderer.toJSON()).toBeNull();
  });

  it('renders the heading with the count and each meeting title', () => {
    const renderer = render(MEETINGS);
    const texts = renderer.root.findAllByType(Text).map((t) => t.props.children).flat();
    expect(texts).toContain('Xuất hiện trong 1 cuộc họp');
    expect(texts).toContain('Sprint Review');
  });

  it('tapping a meeting row calls onMeetingPress with its id', () => {
    const onMeetingPress = jest.fn();
    const renderer = render(MEETINGS, onMeetingPress);
    act(() => {
      renderer.root.findByProps({ title: 'Sprint Review' }).props.onPress();
    });
    expect(onMeetingPress).toHaveBeenCalledWith('m1');
  });
});
