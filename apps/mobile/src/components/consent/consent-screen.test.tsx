import TestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';

/**
 * Exercises `app/(app)/consent.tsx` by relative import. Expo Router turns
 * every file under `app/` into a route, including test files — a
 * `*.test.tsx` left there ships as a route and crashes the bundle (see
 * `route-shape.test.ts`'s "no test files live under app/" guard). Same
 * convention as `settings-screen.test.tsx`.
 */
const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockPush(...args), back: (...args: unknown[]) => mockBack(...args) },
}));

const mockMutateAsync = jest.fn();
let mockMutationState: { isPending: boolean; isError: boolean; error?: unknown };
jest.mock('../../hooks/use-account-mutations', () => ({
  useRecordConsentMutation: () => ({ mutateAsync: mockMutateAsync, ...mockMutationState }),
}));

import ConsentScreen from '../../../app/(app)/consent';
import { PRIVACY_POLICY_ROUTE } from '../../navigation/app-routes';

function render() {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<ConsentScreen />);
  });
  return renderer;
}

describe('ConsentScreen (NFR-01, consent v2)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockMutationState = { isPending: false, isError: false };
  });

  it('does not claim Meetio stores the audio recording, and states the real data flow', () => {
    const renderer = render();
    const bodyText = renderer.root.findAllByType(Text).map((node) => node.props.children).join(' ');
    expect(bodyText).not.toContain('lưu bản ghi âm');
    expect(bodyText).toContain('không rời khỏi máy');
    expect(bodyText).toContain('Google Gemini');
  });

  it('opens the full privacy policy when "Đọc chính sách đầy đủ" is pressed', () => {
    const renderer = render();
    const link = renderer.root
      .findAll((node) => node.props.accessibilityRole === 'link' && typeof node.props.onPress === 'function')[0];
    act(() => {
      link.props.onPress();
    });
    expect(mockPush).toHaveBeenCalledWith(PRIVACY_POLICY_ROUTE);
  });

  it('confirming consent calls the mutation then navigates back', async () => {
    mockMutateAsync.mockResolvedValue({ recording_consent_at: '2026-09-27T00:00:00Z', consent_version: 2 });
    const renderer = render();
    const confirmButton = renderer.root.findAll(
      (node) => node.props.accessibilityRole === 'button' && typeof node.props.onPress === 'function',
    )[0];
    await act(async () => {
      await confirmButton.props.onPress();
    });
    expect(mockMutateAsync).toHaveBeenCalledTimes(1);
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('shows the error message when the mutation fails', () => {
    mockMutationState = { isPending: false, isError: true, error: new Error('boom') };
    const renderer = render();
    const texts = renderer.root.findAllByType(Text).map((node) => node.props.children);
    expect(texts).toContain('Không thể kết nối máy chủ. Kiểm tra kết nối mạng và thử lại.');
  });
});
