import TestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { LibrarySection } from './library-section';
import type { Meeting } from '../../mocks/types';

const MEETINGS: readonly Meeting[] = [
  { id: 'sprint-review', title: 'Sprint Review', durationMinutes: 42, date: '12/05/2025', status: 'done', initials: 'SR' },
  { id: 'project-planning', title: 'Project Planning', durationMinutes: 51, date: '08/05/2025', status: 'processing', initials: 'PP' },
];

function render(meetings: readonly Meeting[], onMeetingPress = jest.fn()) {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<LibrarySection meetings={meetings} onMeetingPress={onMeetingPress} title="Gần đây" />);
  });
  return renderer;
}

function findButton(renderer: TestRenderer.ReactTestRenderer, index = 0) {
  return renderer.root.findAll(
    (node) => node.props.accessibilityRole === 'button' && typeof node.props.onPress === 'function',
  )[index];
}

describe('LibrarySection', () => {
  it('renders the heading and every meeting row title', () => {
    const renderer = render(MEETINGS);
    const texts = renderer.root.findAllByType(Text).map((node) => node.props.children).flat();
    expect(texts).toContain('Gần đây');
    expect(texts).toContain('Sprint Review');
    expect(texts).toContain('Project Planning');
  });

  it('renders nothing — not even the heading — when meetings is empty', () => {
    const renderer = render([]);
    expect(renderer.toJSON()).toBeNull();
  });

  it('calls onMeetingPress with the tapped row\'s id', () => {
    const onMeetingPress = jest.fn();
    const renderer = render(MEETINGS, onMeetingPress);
    act(() => {
      findButton(renderer, 1).props.onPress();
    });
    expect(onMeetingPress).toHaveBeenCalledWith('project-planning');
  });
});
