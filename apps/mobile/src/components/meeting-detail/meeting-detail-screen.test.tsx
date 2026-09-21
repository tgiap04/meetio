import TestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import MeetingDetailScreen from '../../../app/(app)/meeting-detail';
import { MEETINGS } from '../../mocks';
import { MEETING_GRAPH_ROUTE, MEETING_TRANSCRIPT_ROUTE } from '../../navigation/app-routes';

const mockPush = jest.fn();
const mockBack = jest.fn();
let mockSearchParams: { id?: string } = {};

jest.mock('expo-router', () => ({
  router: {
    push: (...args: unknown[]) => mockPush(...args),
    back: (...args: unknown[]) => mockBack(...args),
  },
  useLocalSearchParams: () => mockSearchParams,
}));

function render() {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<MeetingDetailScreen />);
  });
  return renderer;
}

function allText(renderer: TestRenderer.ReactTestRenderer) {
  return renderer.root
    .findAllByType(Text)
    .map((node) => node.props.children)
    .flat()
    .join('');
}

function pressTab(renderer: TestRenderer.ReactTestRenderer, label: string) {
  const tabs = renderer.root.findAllByProps({ accessibilityRole: 'tab' });
  const tab = tabs.find((node) =>
    node
      .findAllByType(Text)
      .map((textNode) => textNode.props.children)
      .flat()
      .join('')
      .includes(label),
  );
  if (!tab) {
    throw new Error(`No tab found with label "${label}"`);
  }
  act(() => {
    tab.props.onPress();
  });
}

describe('MeetingDetailScreen', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockBack.mockClear();
    mockSearchParams = { id: 'sprint-review' };
  });

  it('resolves the meeting named by ?id= and shows its title', () => {
    mockSearchParams = { id: 'client-discussion' };
    const renderer = render();
    expect(allText(renderer)).toContain('Client Discussion');
  });

  it('falls back to the first meeting when ?id= is unknown, without throwing', () => {
    mockSearchParams = { id: 'does-not-exist' };
    expect(() => render()).not.toThrow();
    const renderer = render();
    expect(allText(renderer)).toContain(MEETINGS[0].title);
  });

  it('falls back to the first meeting when ?id= is missing', () => {
    mockSearchParams = {};
    const renderer = render();
    expect(allText(renderer)).toContain(MEETINGS[0].title);
  });

  it('renders both the summary and action items under the Tóm tắt tab', () => {
    const renderer = render();
    expect(allText(renderer)).toContain('Tóm tắt nội dung');
    expect(allText(renderer)).toContain('Action Items');
  });

  it('switches to the Action Items tab without navigating', () => {
    const renderer = render();
    pressTab(renderer, 'Action Items');
    expect(mockPush).not.toHaveBeenCalled();
    expect(allText(renderer)).not.toContain('Tóm tắt nội dung');
    expect(allText(renderer)).toContain('Action Items');
  });

  it('tapping Transcript pushes the transcript route with the resolved id', () => {
    const renderer = render();
    pressTab(renderer, 'Transcript');
    expect(mockPush).toHaveBeenCalledWith({ pathname: MEETING_TRANSCRIPT_ROUTE, params: { id: 'sprint-review' } });
  });

  it('tapping Graph pushes the graph route with the resolved id', () => {
    const renderer = render();
    pressTab(renderer, 'Graph');
    expect(mockPush).toHaveBeenCalledWith({ pathname: MEETING_GRAPH_ROUTE, params: { id: 'sprint-review' } });
  });

  it('keeps the active tab on a content tab after tapping Transcript (simulated pop-back)', () => {
    const renderer = render();
    pressTab(renderer, 'Action Items');
    pressTab(renderer, 'Transcript');
    // Navigating tabs never change `activeContentTab` — popping back still
    // shows the last content tab rather than a blank Transcript panel.
    expect(allText(renderer)).toContain('Action Items');
  });

  it('calls router.back from the header back chevron', () => {
    const renderer = render();
    const backButton = renderer.root.findByProps({ accessibilityLabel: 'Quay lại' });
    act(() => {
      backButton.props.onPress();
    });
    expect(mockBack).toHaveBeenCalled();
  });

  it('renders the kebab as inert', () => {
    const renderer = render();
    const kebab = renderer.root.findByProps({ testID: 'meeting-detail-kebab' });
    expect(kebab.props.disabled).toBe(true);
    expect(kebab.props.accessibilityState).toEqual({ disabled: true });
  });

  it('toggles an action-item checkbox', () => {
    const renderer = render();
    const checkbox = renderer.root.findByProps({
      accessibilityLabel: `${'Hoàn thiện API docs'}, chưa hoàn thành`,
    });
    act(() => {
      checkbox.props.onPress();
    });
    expect(renderer.root.findByProps({ accessibilityLabel: 'Hoàn thiện API docs, đã hoàn thành' })).toBeTruthy();
  });
});
