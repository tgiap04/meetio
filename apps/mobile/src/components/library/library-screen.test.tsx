import TestRenderer, { act } from 'react-test-renderer';
import { Text, TextInput } from 'react-native';

/**
 * Exercises `app/(app)/(tabs)/library.tsx` without touching expo-router's
 * real navigator. Lives here rather than beside the screen file itself
 * because `src/navigation/route-shape.test.ts` (P01, out of this phase's
 * ownership) asserts the exact `.tsx` file list inside `app/(app)/(tabs)/`
 * — adding a sibling `library.test.tsx` there breaks that assertion (same
 * reasoning `home-screen.test.tsx` records for the Home tab). Mock variables
 * must be prefixed with `mock` (case-insensitive) for Jest's out-of-scope
 * check on `jest.mock()` factories.
 */
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockPush(...args) },
}));

import LibraryScreen from '../../../app/(app)/(tabs)/library';
import { MEETING_DETAIL_ROUTE } from '../../navigation/app-routes';

function render() {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<LibraryScreen />);
  });
  return renderer;
}

function allTexts(renderer: TestRenderer.ReactTestRenderer) {
  return renderer.root.findAllByType(Text).map((node) => node.props.children).flat();
}

function findButton(renderer: TestRenderer.ReactTestRenderer, index = 0) {
  return renderer.root.findAll(
    (node) => node.props.accessibilityRole === 'button' && typeof node.props.onPress === 'function',
  )[index];
}

describe('(tabs)/library screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the corrected "Thư viện" header and never the crop\'s "Hỏi đáp AI"', () => {
    const renderer = render();
    const texts = allTexts(renderer);
    expect(texts).toContain('Thư viện');
    expect(texts.join(' ')).not.toContain('Hỏi đáp AI');
  });

  it('renders all four meetings under the "Tất cả" filter, across both sections', () => {
    const renderer = render();
    const texts = allTexts(renderer);
    expect(texts).toContain('Gần đây');
    expect(texts).toContain('Tuần trước');
    expect(texts).toContain('Sprint Review');
    expect(texts).toContain('Client Discussion');
    expect(texts).toContain('Project Planning');
    expect(texts).toContain('Marketing Brief');
  });

  it('"Đang xử lý" leaves only Project Planning and hides the emptied "Gần đây" heading', () => {
    const renderer = render();
    act(() => {
      // Buttons in tree order: 0 = filter funnel, then chips 1 = Tất cả,
      // 2 = Đã xử lý, 3 = Đang xử lý.
      findButton(renderer, 3).props.onPress();
    });
    const texts = allTexts(renderer);
    expect(texts).toContain('Project Planning');
    expect(texts).not.toContain('Sprint Review');
    expect(texts).not.toContain('Client Discussion');
    expect(texts).not.toContain('Marketing Brief');
    expect(texts).not.toContain('Gần đây');
    expect(texts).toContain('Tuần trước');
  });

  it('a search query narrows the rendered rows', () => {
    const renderer = render();
    act(() => {
      renderer.root.findByType(TextInput).props.onChangeText('Sprint');
    });
    const texts = allTexts(renderer);
    expect(texts).toContain('Sprint Review');
    expect(texts).not.toContain('Client Discussion');
    expect(texts).not.toContain('Project Planning');
    expect(texts).not.toContain('Marketing Brief');
  });

  it('tapping a meeting row pushes meeting detail with that meeting\'s id', () => {
    const renderer = render();
    act(() => {
      // Buttons in tree order: 0 = filter funnel, 1-3 = status chips,
      // 4 = the first meeting row (Sprint Review).
      findButton(renderer, 4).props.onPress();
    });
    expect(mockPush).toHaveBeenCalledWith({ pathname: MEETING_DETAIL_ROUTE, params: { id: 'sprint-review' } });
  });

  it('the funnel filter button is rendered but inert', () => {
    const renderer = render();
    const filterButton = renderer.root.findByProps({ accessibilityLabel: 'Bộ lọc' });
    expect(filterButton).toBeTruthy();
    expect(() => act(() => filterButton.props.onPress())).not.toThrow();
  });
});
