import TestRenderer, { act } from 'react-test-renderer';
import { Text, TextInput } from 'react-native';

/**
 * Exercises `app/(app)/(tabs)/search.tsx` without touching expo-router.
 * Mock variables must be prefixed with `mock` (case-insensitive) for Jest's
 * out-of-scope check on `jest.mock()` factories.
 *
 * This file lives under `src/`, not `app/` — Expo Router turns every file
 * under `app/` into a route, so a `*.test.tsx` living beside `search.tsx`
 * both collides with route discovery and drags Jest globals into the app
 * bundle (crashes the running app; see `app-group-layout.test.tsx` for the
 * precedent) AND trips `route-shape.test.ts`'s exact-file-list assertion for
 * `(tabs)/`. Importing the screen component back from `app/` (below) keeps
 * the test exercising the real file while staying out of the route tree.
 */
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockPush(...args) },
}));

import SearchScreen from '../../../app/(app)/(tabs)/search';
import { MEETING_DETAIL_ROUTE } from '../../navigation/app-routes';

function render() {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<SearchScreen />);
  });
  return renderer;
}

function headingTexts(renderer: TestRenderer.ReactTestRenderer) {
  return renderer.root
    .findAllByType(Text)
    .map((node) => node.props.children)
    .filter((child): child is string => typeof child === 'string');
}

/** Finds the nearest Pressable-button ancestor (any, including one with no `onPress`) of the Text node carrying `label`. */
function findPressableAncestor(renderer: TestRenderer.ReactTestRenderer, label: string) {
  let current = renderer.root.findByProps({ children: label });
  while (current.props.accessibilityRole !== 'button') {
    current = current.parent!;
  }
  return current;
}

/** Finds the Pressable-button ancestor that actually carries a real `onPress` handler. */
function findRowButtonByText(renderer: TestRenderer.ReactTestRenderer, label: string) {
  let current = renderer.root.findByProps({ children: label });
  while (current.props.accessibilityRole !== 'button' || typeof current.props.onPress !== 'function') {
    current = current.parent!;
  }
  return current;
}

describe('(tabs)/search screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders "Tìm kiếm" with no back button and all three groups under "Tất cả"', () => {
    const renderer = render();
    expect(headingTexts(renderer)).toContain('Tìm kiếm');
    expect(headingTexts(renderer)).toContain('Cuộc họp (3)');
    expect(headingTexts(renderer)).toContain('Tài liệu (2)');
    expect(headingTexts(renderer)).toContain('Người (1)');
    expect(renderer.root.findAllByProps({ accessibilityLabel: 'Quay lại' })).toHaveLength(0);
  });

  it('renders every group row title exactly once, matching the heading counts', () => {
    const renderer = render();
    const texts = headingTexts(renderer);
    const titles = ['Sprint Review', 'Client Discussion', 'Project Planning', 'API Documentation', 'Meeting Summary', 'Nguyễn Văn Anh'];
    for (const title of titles) {
      expect(texts.filter((text) => text === title)).toHaveLength(1);
    }
  });

  it('the "Meeting" chip leaves only the Cuộc họp section, with a matching heading count', () => {
    const renderer = render();
    const meetingChip = findRowButtonByText(renderer, 'Meeting');
    act(() => {
      meetingChip.props.onPress();
    });
    const headings = headingTexts(renderer);
    expect(headings).toContain('Cuộc họp (3)');
    expect(headings).not.toContain('Tài liệu (2)');
    expect(headings).not.toContain('Người (1)');
  });

  it('the "Transcript" chip shows only Tài liệu, and "Node" shows only Người', () => {
    const renderer = render();
    act(() => {
      findRowButtonByText(renderer, 'Transcript').props.onPress();
    });
    expect(headingTexts(renderer)).toContain('Tài liệu (2)');
    expect(headingTexts(renderer)).not.toContain('Cuộc họp (3)');

    act(() => {
      findRowButtonByText(renderer, 'Node').props.onPress();
    });
    expect(headingTexts(renderer)).toContain('Người (1)');
    expect(headingTexts(renderer)).not.toContain('Tài liệu (2)');
  });

  it('a query narrows the rows and keeps the heading count correct', () => {
    const renderer = render();
    const input = renderer.root.findByType(TextInput);
    act(() => {
      input.props.onChangeText('Sprint');
    });
    const headings = headingTexts(renderer);
    expect(headings).toContain('Cuộc họp (1)');
    expect(headings).not.toContain('Tài liệu (2)');
    expect(headings).not.toContain('Người (1)');
  });

  it('pushes a meeting row to meeting detail with its id', () => {
    const renderer = render();
    act(() => {
      findRowButtonByText(renderer, 'Sprint Review').props.onPress();
    });
    expect(mockPush).toHaveBeenCalledWith({ pathname: MEETING_DETAIL_ROUTE, params: { id: 'sprint-review' } });
  });

  it('pushes a document row to meeting detail with its id', () => {
    const renderer = render();
    act(() => {
      findRowButtonByText(renderer, 'API Documentation').props.onPress();
    });
    expect(mockPush).toHaveBeenCalledWith({ pathname: MEETING_DETAIL_ROUTE, params: { id: 'api-documentation' } });
  });

  it('does not push when a person row is pressed', () => {
    const renderer = render();
    act(() => {
      findPressableAncestor(renderer, 'Nguyễn Văn Anh').props.onPress?.();
    });
    expect(mockPush).not.toHaveBeenCalled();
  });
});
