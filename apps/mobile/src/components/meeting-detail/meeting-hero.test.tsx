import TestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { MeetingHero } from './meeting-hero';
import type { Meeting } from '../../mocks/types';

const MEETING: Meeting = {
  id: 'sprint-review',
  title: 'Sprint Review',
  durationMinutes: 42,
  date: '12/05/2025',
  status: 'done',
  initials: 'SR',
};

function render(meeting: Meeting) {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<MeetingHero meeting={meeting} />);
  });
  return renderer;
}

describe('MeetingHero', () => {
  it('renders the meeting title', () => {
    const renderer = render(MEETING);
    const texts = renderer.root.findAllByType(Text).map((node) => node.props.children).flat().join('');
    expect(texts).toContain('Sprint Review');
  });

  it('renders the date and duration meta line', () => {
    const renderer = render(MEETING);
    const texts = renderer.root.findAllByType(Text).map((node) => node.props.children).flat().join('');
    expect(texts).toContain('12/05/2025');
    expect(texts).toContain('42 phút');
  });

  it('renders the status badge label for the given status', () => {
    const renderer = render({ ...MEETING, status: 'processing' });
    const texts = renderer.root.findAllByType(Text).map((node) => node.props.children).flat().join('');
    expect(texts).toContain('Đang xử lý');
  });
});
