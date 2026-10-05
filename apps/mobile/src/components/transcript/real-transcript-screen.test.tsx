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

const mockUseMeetingQuery = jest.fn();
jest.mock('../../hooks/use-meeting-detail-query', () => ({
  useMeetingQuery: (...args: unknown[]) => mockUseMeetingQuery(...args),
}));

const mockRetryTranslation = jest.fn();
let mockRetrying = new Set<number>();
let mockRetryErrors: Record<number, string> = {};
let mockRunTranslation: ((seq: number) => Promise<void>) | null = null;
jest.mock('../../hooks/use-retry-segment-translation', () => ({
  useRetrySegmentTranslation: (run: (seq: number) => Promise<void>) => {
    mockRunTranslation = run;
    return { retry: mockRetryTranslation, retrying: mockRetrying, errors: mockRetryErrors };
  },
}));
const mockTranslateSegment = jest.fn();
jest.mock('../../hooks/use-translate-segment', () => ({
  useTranslateSegment: () => mockTranslateSegment,
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

function render(meetingId = 'm1', initialSeq?: number) {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <RealTranscriptScreen initialSeq={initialSeq} meetingId={meetingId} onBack={jest.fn()} />,
    );
  });
  renderers.push(renderer);
  return renderer;
}

describe('RealTranscriptScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseMeetingQuery.mockReturnValue({ data: { translate_to: null } });
    mockRetrying = new Set();
    mockRetryErrors = {};
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

  describe('jumping in from a Search-tab result (US-22)', () => {
    it('threads initialSeq through to the segments hook as the initial from_seq', () => {
      mockSuccess([segment({ seq: 42, text: 'Đoạn khớp' })]);
      render('m1', 42);
      expect(mockUseInfiniteSegmentsQuery).toHaveBeenCalledWith('m1', 42);
    });

    it('does not throw scrolling to the matching segment once its page loads', () => {
      mockSuccess([segment({ seq: 1 }), segment({ seq: 42, text: 'Đoạn khớp' })]);
      expect(() => render('m1', 42)).not.toThrow();
    });

    it('passes null as the initial from_seq for the ordinary open-from-meeting-detail path', () => {
      mockSuccess([segment({ seq: 1 })]);
      render('m1');
      expect(mockUseInfiniteSegmentsQuery).toHaveBeenCalledWith('m1', null);
    });
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

  describe('translated meetings (Phase 09)', () => {
    const translatedMeeting = () => mockUseMeetingQuery.mockReturnValue({ data: { translate_to: 'en-US' } });
    const texts = (r: TestRenderer.ReactTestRenderer) => r.root.findAllByType(Text).map((n) => n.props.children);
    const tab = (r: TestRenderer.ReactTestRenderer, label: string) =>
      r.root.findAll((n) => n.props.accessibilityRole === 'tab' && typeof n.props.onPress === 'function' && n.findAllByType(Text)[0]?.props.children === label)[0];
    const items = () => [
      segment({ seq: 1, text: 'Xin chào', translated_text: 'Hello', translated_to: 'en-US' }),
      segment({ seq: 2, text: 'Tạm biệt', translated_text: null, translated_to: null }),
    ];

    it('has no switch for a meeting without translation', () => {
      mockSuccess(items().slice(0, 1).map((s) => ({ ...s, translated_text: null, translated_to: null })));
      const r = render();
      expect(texts(r)).not.toContain('Song song');
    });

    it('shows the switch, defaulting to side by side, and each mode changes what is read', () => {
      translatedMeeting();
      mockSuccess(items());
      const r = render();
      expect(texts(r)).toEqual(expect.arrayContaining(['Gốc', 'Dịch', 'Song song', 'Xin chào', 'Hello']));

      act(() => tab(r, 'Gốc').props.onPress());
      expect(texts(r)).toContain('Xin chào');
      expect(texts(r)).not.toContain('Hello');

      act(() => tab(r, 'Dịch').props.onPress());
      expect(texts(r)).toContain('Hello');
      expect(texts(r)).not.toContain('Xin chào');
    });

    it('offers "Dịch" for an untranslated segment only and translates THAT seq', () => {
      translatedMeeting();
      mockSuccess(items());
      const r = render();
      const retry = r.root.findAll((n) => n.props.accessibilityLabel === 'Dịch đoạn này' && typeof n.props.onPress === 'function');
      expect(retry).toHaveLength(1);
      act(() => retry[0].props.onPress());
      expect(mockRetryTranslation).toHaveBeenCalledWith(2);
    });

    it('"Dịch" translates that segment\'s text on the device and stores it (the hook does the work)', async () => {
      translatedMeeting();
      mockSuccess(items());
      render();
      await mockRunTranslation!(2);
      expect(mockTranslateSegment).toHaveBeenCalledTimes(1);
      expect(mockTranslateSegment).toHaveBeenCalledWith(expect.objectContaining({ seq: 2, text: 'Tạm biệt' }));
      mockTranslateSegment.mockClear();
      await mockRunTranslation!(99); // a seq that is no longer listed does nothing
      expect(mockTranslateSegment).not.toHaveBeenCalled();
    });

    it('a search also finds text in the translation while it is shown', () => {
      translatedMeeting();
      mockSuccess(items());
      const r = render();
      act(() => r.root.findByType(TextInput).props.onChangeText('hello'));
      expect(texts(r)).toContain('Xin chào');
      expect(texts(r)).not.toContain('Tạm biệt');
    });
  });
});
