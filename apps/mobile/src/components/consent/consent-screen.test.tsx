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

const mockMutate = jest.fn();
let mockMutationState: { isPending: boolean; isError: boolean; error?: unknown };
jest.mock('../../hooks/use-account-mutations', () => ({
  useRecordConsentMutation: () => ({ mutate: mockMutate, ...mockMutationState }),
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

describe('ConsentScreen (NFR-01, consent v3)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockMutationState = { isPending: false, isError: false };
  });

  it('does not claim Meetio stores the audio recording, and states the real data flow', () => {
    const renderer = render();
    const bodyText = renderer.root.findAllByType(Text).map((node) => node.props.children).join(' ');
    expect(bodyText).not.toContain('lưu bản ghi âm');
    expect(bodyText).toContain('Google Gemini');
  });

  it('says on-device recognition is the usual case, not a guarantee, and discloses the server fallback (Phase 18)', () => {
    const renderer = render();
    const bodyText = renderer.root.findAllByType(Text).map((node) => node.props.children).join(' ').replace(/\s+/g, ' ');
    expect(bodyText).toContain('thường được nhận diện ngay trên điện thoại');
    expect(bodyText).not.toContain('giọng nói được nhận diện ngay trên điện thoại');
    expect(bodyText).toContain(
      'Riêng trên điện thoại không nhận diện giọng nói offline được, âm thanh được gửi liên tục tới máy chủ Meetio và Google Gemini để chuyển thành chữ; Meetio không lưu âm thanh.',
    );
    expect(bodyText).toContain(
      'Hiện Meetio dùng gói miễn phí của Gemini API, nên Google có thể dùng nội dung gửi tới (văn bản và âm thanh) để cải thiện sản phẩm của họ.',
    );
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
    // Like TanStack's `mutate`: runs `onSuccess` once the request resolves.
    mockMutate.mockImplementation((_vars: unknown, options?: { onSuccess?: () => void }) => options?.onSuccess?.());
    const renderer = render();
    const confirmButton = renderer.root.findAll(
      (node) => node.props.accessibilityRole === 'button' && typeof node.props.onPress === 'function',
    )[0];
    await act(async () => {
      await confirmButton.props.onPress();
    });
    expect(mockMutate).toHaveBeenCalledTimes(1);
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('shows the error message when the mutation fails', () => {
    mockMutationState = { isPending: false, isError: true, error: new Error('boom') };
    const renderer = render();
    const texts = renderer.root.findAllByType(Text).map((node) => node.props.children);
    expect(texts).toContain('Không thể kết nối máy chủ. Kiểm tra kết nối mạng và thử lại.');
  });
});
