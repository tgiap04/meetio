import TestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { SearchResultSection } from './search-result-section';
import type { MeetingSearchGroup, PersonSearchGroup } from '../../mocks/types';

const MEETING_GROUP: MeetingSearchGroup = {
  id: 'group-meetings',
  label: 'Cuộc họp',
  kind: 'meeting',
  items: [
    {
      kind: 'meeting',
      id: 'sprint-review',
      title: 'Sprint Review',
      durationMinutes: 42,
      date: '12/05/2025',
      status: 'done',
      snippet: '...authentication và API...',
    },
    {
      kind: 'meeting',
      id: 'client-discussion',
      title: 'Client Discussion',
      durationMinutes: 28,
      date: '10/05/2025',
      status: 'done',
      snippet: '...triển khai API...',
    },
    {
      kind: 'meeting',
      id: 'project-planning',
      title: 'Project Planning',
      durationMinutes: 51,
      date: '08/05/2025',
      status: 'processing',
      snippet: '...kế hoạch API và authentication...',
    },
  ],
};

function render(group: MeetingSearchGroup | PersonSearchGroup, onMeetingPress = jest.fn()) {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<SearchResultSection group={group} onMeetingPress={onMeetingPress} />);
  });
  return { renderer, onMeetingPress };
}

/** Rendered row titles — every `SearchResultRow` draws its item's title as a `Text` child. */
function renderedTitles(renderer: TestRenderer.ReactTestRenderer) {
  const allTexts = renderer.root.findAllByType(Text).map((node) => node.props.children);
  const knownTitles = MEETING_GROUP.items.map((item) => item.title);
  return allTexts.filter((child): child is string => typeof child === 'string' && knownTitles.includes(child));
}

/** Finds the Pressable-button ancestor (the one carrying a real `onPress`) of the Text node carrying `title`. */
function findRowButton(renderer: TestRenderer.ReactTestRenderer, title: string) {
  let current = renderer.root.findByProps({ children: title });
  while (current.props.accessibilityRole !== 'button' || typeof current.props.onPress !== 'function') {
    current = current.parent!;
  }
  return current;
}

describe('SearchResultSection', () => {
  it('derives the heading count from items.length, matching the rendered row count', () => {
    const { renderer } = render(MEETING_GROUP);
    const heading = renderer.root.findAllByType(Text)[0].props.children;
    expect(heading).toBe('Cuộc họp (3)');
    // Heading says 3; exactly 3 title rows are actually rendered — the
    // direct guard against the design's own "(3) heading, 2 rows" defect.
    expect(renderedTitles(renderer)).toHaveLength(3);
  });

  it('keeps the heading count correct for a smaller, filtered group', () => {
    const narrowed: MeetingSearchGroup = { ...MEETING_GROUP, items: [MEETING_GROUP.items[0]] };
    const { renderer } = render(narrowed);
    const heading = renderer.root.findAllByType(Text)[0].props.children;
    expect(heading).toBe('Cuộc họp (1)');
    expect(renderedTitles(renderer)).toHaveLength(1);
    expect(renderedTitles(renderer)).toEqual(['Sprint Review']);
  });

  it('routes a tapped row through onMeetingPress with the item id', () => {
    const { renderer, onMeetingPress } = render(MEETING_GROUP);
    act(() => {
      findRowButton(renderer, 'Sprint Review').props.onPress();
    });
    expect(onMeetingPress).toHaveBeenCalledWith('sprint-review');
  });
});
