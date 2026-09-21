import TestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';

const mockPush = jest.fn();
const mockBack = jest.fn();

jest.mock('expo-router', () => ({
  router: {
    push: (...args: unknown[]) => mockPush(...args),
    back: (...args: unknown[]) => mockBack(...args),
  },
}));

import RecordingLiveScreen from '../../../app/(app)/recording-live';
import { RECORDING_DONE_ROUTE } from '../../navigation/app-routes';
import { TRANSCRIPT_LINES } from '../../mocks';

function renderScreen() {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<RecordingLiveScreen />);
  });
  return renderer;
}

describe('RecordingLiveScreen', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockBack.mockClear();
  });

  it('renders the status label and the design elapsed time', () => {
    const renderer = renderScreen();
    const texts = renderer.root.findAllByType(Text).map((node) => node.props.children);
    expect(texts).toContain('Đang ghi âm');
    expect(texts).toContain('00:24:18');
  });

  it('navigates to the done route when pause is pressed', () => {
    const renderer = renderScreen();
    act(() => {
      renderer.root.findByProps({ testID: 'recording-pause-button' }).props.onPress();
    });
    expect(mockPush).toHaveBeenCalledWith(RECORDING_DONE_ROUTE);
  });

  it('goes back when the close button is pressed', () => {
    const renderer = renderScreen();
    act(() => {
      renderer.root.findByProps({ testID: 'recording-close-button' }).props.onPress();
    });
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('switches the transcript feed language when the Tiếng Anh tab is pressed', () => {
    const renderer = renderScreen();
    const firstLine = TRANSCRIPT_LINES[0];

    const tabs = renderer.root.findAllByProps({ accessibilityRole: 'tab' });
    const englishTab = tabs.find((tab) => {
      const label = tab.findAllByType(Text)[0]?.props.children;
      return label === 'Tiếng Anh';
    });
    expect(englishTab).toBeTruthy();

    act(() => {
      englishTab!.props.onPress();
    });

    const textsAfter = renderer.root
      .findAllByType(Text)
      .map((node) => node.props.children)
      .flat()
      .join(' ');
    expect(textsAfter).toContain(firstLine.translation);
  });
});
