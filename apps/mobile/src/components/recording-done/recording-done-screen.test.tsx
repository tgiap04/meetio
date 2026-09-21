import TestRenderer, { act } from 'react-test-renderer';

/**
 * Exercises `app/(app)/recording-done.tsx` without touching native
 * navigation. Mirrors `permission-screen.test.tsx`'s approach of mocking
 * `expo-router`'s `router` object directly.
 *
 * Lives in `src/`, not next to the route file: Expo Router turns every file
 * under `app/` into a route, including `*.test.tsx` — see the note atop
 * `src/navigation/app-group-layout.test.tsx` for the collision that caused
 * (route `/(app)/_layout` crashing the running app with jest globals bundled
 * in, while typecheck/lint/tests all stayed green). Importing the screen by
 * relative path from here avoids that.
 */
const mockBack = jest.fn();
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  router: {
    back: (...args: unknown[]) => mockBack(...args),
    push: (...args: unknown[]) => mockPush(...args),
  },
}));

import RecordingDoneScreen from '../../../app/(app)/recording-done';
import { ProcessingStepRow } from './processing-step-row';
import { StatusBadge } from '../ui/status-badge';
import { SecondaryButton } from '../ui/secondary-button';
import { MEETING_DETAIL_ROUTE, MEETING_GRAPH_ROUTE } from '../../navigation/app-routes';

function render() {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<RecordingDoneScreen />);
  });
  return renderer;
}

describe('(app)/recording-done screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders exactly one processing badge and one navigable (chevron) row', () => {
    const renderer = render();
    expect(renderer.root.findAllByType(StatusBadge)).toHaveLength(1);
    expect(renderer.root.findAllByProps({ name: 'chevronRight' })).toHaveLength(1);
  });

  it('back chevron navigates back to the live recording screen', () => {
    const renderer = render();
    const back = renderer.root.findByProps({ accessibilityLabel: 'Quay lại' });

    act(() => {
      back.props.onPress();
    });

    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('exactly one of the four pipeline rows is navigable, and it is Knowledge Graph', () => {
    const renderer = render();
    const rows = renderer.root.findAllByType(ProcessingStepRow);
    expect(rows).toHaveLength(4);

    const navigableRows = rows.filter((row) => row.props.onPress);
    expect(navigableRows).toHaveLength(1);
    expect(navigableRows[0].props.label).toBe('Knowledge Graph');

    act(() => {
      navigableRows[0].props.onPress();
    });

    expect(mockPush).toHaveBeenCalledWith(MEETING_GRAPH_ROUTE);
  });

  it('"Xem chi tiết tiến trình" pushes the meeting-detail route', () => {
    const renderer = render();
    const button = renderer.root.findByType(SecondaryButton);

    act(() => {
      button.props.onPress();
    });

    expect(mockPush).toHaveBeenCalledWith(MEETING_DETAIL_ROUTE);
  });
});
