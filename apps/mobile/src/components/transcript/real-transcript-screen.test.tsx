import TestRenderer, { act } from 'react-test-renderer';
import { Alert, Text, TextInput } from 'react-native';
import type { TranscriptSegmentItem } from '@meetio/shared';

const mockUseInfiniteSegmentsQuery = jest.fn();
jest.mock('../../hooks/use-segments-query', () => ({
  useInfiniteSegmentsQuery: (...args: unknown[]) => mockUseInfiniteSegmentsQuery(...args),
}));

const mockUpdateSegmentMutate = jest.fn();
jest.mock('../../hooks/use-segment-mutations', () => ({
  useUpdateSegmentMutation: () => ({ mutate: mockUpdateSegmentMutate, isPending: false }),
}));

const mockReindexMutate = jest.fn();
jest.mock('../../hooks/use-meeting-mutations', () => ({
  useReindexMeetingMutation: () => ({ mutate: mockReindexMutate, isPending: false }),
}));

jest.mock('../../storage/transcript-read-position', () => ({
  readLastReadSeq: jest.fn().mockResolvedValue(null),
  writeLastReadSeq: jest.fn().mockResolvedValue(undefined),
}));

import { RealTranscriptScreen } from './real-transcript-screen';

function segment(overrides: Partial<TranscriptSegmentItem> = {}): TranscriptSegmentItem {
  return {
    id: `s${overrides.seq ?? 1}`,
    seq: 1,
    text: 'Xin chào',
    started_at_ms: 1_000,
    ended_at_ms: 2_000,
    gap_before_ms: null,
    is_edited: false,
    translated_text: null,
    translated_to: null,
    ...overrides,
  };
}

function mockSuccess(
  items: TranscriptSegmentItem[],
  overrides: { hasNextPage?: boolean; isFetchingNextPage?: boolean; fetchNextPage?: jest.Mock } = {},
) {
  const fetchNextPage = overrides.fetchNextPage ?? jest.fn();
  mockUseInfiniteSegmentsQuery.mockReturnValue({
    isPending: false,
    isError: false,
    data: { pages: [{ items, next_from_seq: null }] },
    hasNextPage: overrides.hasNextPage ?? false,
    isFetchingNextPage: overrides.isFetchingNextPage ?? false,
    fetchNextPage,
    refetch: jest.fn(),
  });
  return fetchNextPage;
}

const renderers: TestRenderer.ReactTestRenderer[] = [];

function render(meetingId = 'm1') {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<RealTranscriptScreen meetingId={meetingId} onBack={jest.fn()} />);
  });
  renderers.push(renderer);
  return renderer;
}

describe('RealTranscriptScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    while (renderers.length > 0) {
      act(() => renderers.pop()?.unmount());
    }
  });

  it('renders LoadingState while segments are pending', () => {
    mockUseInfiniteSegmentsQuery.mockReturnValue({ isPending: true, isError: false });
    const renderer = render();
    expect(renderer.root.findByProps({ testID: 'loading-state' })).toBeTruthy();
  });

  it('renders ErrorState and retries on error', () => {
    const refetch = jest.fn();
    mockUseInfiniteSegmentsQuery.mockReturnValue({ isPending: false, isError: true, error: new Error('x'), refetch });
    const renderer = render();
    act(() => renderer.root.findByProps({ testID: 'error-state-retry' }).props.onPress());
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('renders every loaded segment', () => {
    mockSuccess([segment({ seq: 1, text: 'Đoạn một' }), segment({ seq: 2, text: 'Đoạn hai' })]);
    const renderer = render();
    const texts = renderer.root.findAllByType(Text).map((n) => n.props.children);
    expect(texts).toContain('Đoạn một');
    expect(texts).toContain('Đoạn hai');
  });

  it('a search query narrows the rendered segments', () => {
    mockSuccess([segment({ seq: 1, text: 'Nói về ngân sách' }), segment({ seq: 2, text: 'Nói về lịch trình' })]);
    const renderer = render();
    act(() => {
      renderer.root.findByType(TextInput).props.onChangeText('ngân sách');
    });
    const texts = renderer.root.findAllByType(Text).map((n) => n.props.children);
    expect(texts).toContain('Nói về ngân sách');
    expect(texts).not.toContain('Nói về lịch trình');
  });

  it('saves an edited segment then prompts to re-run AI analysis', () => {
    mockSuccess([segment({ seq: 1, text: 'Bản gốc' })]);
    const renderer = render();
    act(() => {
      renderer.root.findByProps({ accessibilityLabel: 'Sửa đoạn 00:01' }).props.onPress();
    });
    act(() => {
      renderer.root.findByProps({ testID: 'segment-edit-input-s1' }).props.onChangeText('Bản đã sửa');
    });
    act(() => {
      renderer.root.findByProps({ testID: 'segment-edit-input-s1' }).props.onBlur();
    });
    expect(mockUpdateSegmentMutate).toHaveBeenCalledWith(
      { id: 's1', body: { text: 'Bản đã sửa' } },
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
    );

    // Simulate the mutation succeeding — the screen's onSuccess callback fires the prompt.
    const [, callbacks] = mockUpdateSegmentMutate.mock.calls[0];
    act(() => callbacks.onSuccess());
    expect(Alert.alert).toHaveBeenCalledWith(
      'Chạy lại phân tích AI?',
      expect.stringContaining('thời gian và chi phí'),
      expect.any(Array),
    );
  });

  it('runs the reindex mutation with scope changed when the alert action is chosen', () => {
    mockSuccess([segment({ seq: 1, text: 'Bản gốc' })]);
    const renderer = render();
    act(() => {
      renderer.root.findByProps({ accessibilityLabel: 'Sửa đoạn 00:01' }).props.onPress();
    });
    act(() => {
      renderer.root.findByProps({ testID: 'segment-edit-input-s1' }).props.onChangeText('Bản đã sửa');
    });
    act(() => {
      renderer.root.findByProps({ testID: 'segment-edit-input-s1' }).props.onBlur();
    });
    const [, callbacks] = mockUpdateSegmentMutate.mock.calls[0];
    act(() => callbacks.onSuccess());

    const alertCall = (Alert.alert as jest.Mock).mock.calls[0];
    const buttons = alertCall[2] as Array<{ text: string; onPress?: () => void }>;
    const confirmButton = buttons.find((b) => b.text === 'Chạy lại');
    act(() => confirmButton?.onPress?.());
    expect(mockReindexMutate).toHaveBeenCalledWith({ scope: 'changed' });
  });

  it('shows the request error via Alert when saving a segment fails', () => {
    mockSuccess([segment({ seq: 1, text: 'Bản gốc' })]);
    const renderer = render();
    act(() => {
      renderer.root.findByProps({ accessibilityLabel: 'Sửa đoạn 00:01' }).props.onPress();
    });
    act(() => {
      renderer.root.findByProps({ testID: 'segment-edit-input-s1' }).props.onChangeText('Bản đã sửa');
    });
    act(() => {
      renderer.root.findByProps({ testID: 'segment-edit-input-s1' }).props.onBlur();
    });
    const [, callbacks] = mockUpdateSegmentMutate.mock.calls[0];
    act(() => callbacks.onError(new Error('network')));
    expect(Alert.alert).toHaveBeenCalledWith('Không lưu được', expect.any(String));
  });

  it('scrolls to top when "Đầu" is tapped', () => {
    mockSuccess([segment({ seq: 1 })]);
    const renderer = render();
    expect(() => act(() => renderer.root.findByProps({ testID: 'transcript-jump-top' }).props.onPress())).not.toThrow();
  });

  describe('search across not-yet-loaded pages', () => {
    it('keeps fetching pages when a query has no matches yet and more pages remain', () => {
      const fetchNextPage = mockSuccess([segment({ seq: 1, text: 'Nói về lịch trình' })], { hasNextPage: true });
      const renderer = render();
      act(() => {
        renderer.root.findByType(TextInput).props.onChangeText('ngân sách');
      });
      expect(fetchNextPage).toHaveBeenCalledTimes(1);
    });

    it('shows the "searching the whole transcript" indicator while auto-fetching', () => {
      mockSuccess([segment({ seq: 1, text: 'Nói về lịch trình' })], { hasNextPage: true });
      const renderer = render();
      act(() => {
        renderer.root.findByType(TextInput).props.onChangeText('ngân sách');
      });
      expect(renderer.root.findByProps({ testID: 'transcript-searching-all-pages' })).toBeTruthy();
    });

    it('does not show the flat "no results" empty state while still searching other pages', () => {
      mockSuccess([segment({ seq: 1, text: 'Nói về lịch trình' })], { hasNextPage: true });
      const renderer = render();
      act(() => {
        renderer.root.findByType(TextInput).props.onChangeText('ngân sách');
      });
      const texts = renderer.root.findAllByType(Text).map((n) => n.props.children);
      expect(texts).not.toContain('Không tìm thấy kết quả phù hợp');
    });

    it('does not auto-fetch once a match is found on the currently loaded page', () => {
      const fetchNextPage = mockSuccess([segment({ seq: 1, text: 'Nói về ngân sách' })], { hasNextPage: true });
      const renderer = render();
      act(() => {
        renderer.root.findByType(TextInput).props.onChangeText('ngân sách');
      });
      expect(fetchNextPage).not.toHaveBeenCalled();
    });

    it('does not auto-fetch when there is no active search query', () => {
      const fetchNextPage = mockSuccess([segment({ seq: 1 })], { hasNextPage: true });
      render();
      expect(fetchNextPage).not.toHaveBeenCalled();
    });
  });
});
