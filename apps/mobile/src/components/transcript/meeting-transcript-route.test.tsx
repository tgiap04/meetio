import TestRenderer, { act } from 'react-test-renderer';

/**
 * Exercises `app/(app)/meeting-transcript.tsx` in isolation. Lives under
 * `src/`, not `app/` — see `route-shape.test.ts`'s "no test files live under
 * app/" guard.
 */
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  router: { back: (...args: unknown[]) => mockBack(...args) },
  useLocalSearchParams: () => mockUseLocalSearchParams(),
}));

const mockUseLocalSearchParams = jest.fn();

const mockRealTranscriptScreen = jest.fn((_props: unknown) => null);
jest.mock('../../components/transcript/real-transcript-screen', () => ({
  RealTranscriptScreen: (props: unknown) => mockRealTranscriptScreen(props),
}));

import MeetingTranscriptScreen from '../../../app/(app)/meeting-transcript';

function render() {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<MeetingTranscriptScreen />);
  });
  return renderer;
}

describe('meeting-transcript route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows an error state with no meeting id', () => {
    mockUseLocalSearchParams.mockReturnValue({});
    const renderer = render();
    expect(renderer.root.findByProps({ testID: 'error-state' })).toBeTruthy();
  });

  it('passes no initialSeq when seq is absent', () => {
    mockUseLocalSearchParams.mockReturnValue({ id: 'm1' });
    render();
    expect(mockRealTranscriptScreen).toHaveBeenCalledWith(
      expect.objectContaining({ meetingId: 'm1', initialSeq: undefined }),
    );
  });

  it('parses a numeric seq param into initialSeq', () => {
    mockUseLocalSearchParams.mockReturnValue({ id: 'm1', seq: '42' });
    render();
    expect(mockRealTranscriptScreen).toHaveBeenCalledWith(
      expect.objectContaining({ meetingId: 'm1', initialSeq: 42 }),
    );
  });

  it('ignores a non-numeric seq param rather than passing NaN through', () => {
    mockUseLocalSearchParams.mockReturnValue({ id: 'm1', seq: 'not-a-number' });
    render();
    expect(mockRealTranscriptScreen).toHaveBeenCalledWith(
      expect.objectContaining({ meetingId: 'm1', initialSeq: undefined }),
    );
  });
});
