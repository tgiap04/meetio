import TestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { TranscriptMeetingSections, type TranscriptMeetingSectionsProps } from './transcript-meeting-sections';

function idleQuery() {
  return { isPending: true, isError: false, data: undefined, hasNextPage: false, isFetchingNextPage: false, refetch: jest.fn(), fetchNextPage: jest.fn() };
}

function render(overrides: Partial<TranscriptMeetingSectionsProps> = {}) {
  const props: TranscriptMeetingSectionsProps = {
    transcriptEnabled: true,
    meetingEnabled: true,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test double for the query result shape
    semanticQuery: idleQuery() as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test double for the query result shape
    meetingQuery: idleQuery() as any,
    onMeetingPress: jest.fn(),
    onTranscriptPress: jest.fn(),
    ...overrides,
  };
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<TranscriptMeetingSections {...props} />);
  });
  return renderer;
}

function allTexts(renderer: TestRenderer.ReactTestRenderer) {
  return renderer.root.findAllByType(Text).map((t) => t.props.children).flat();
}

describe('TranscriptMeetingSections', () => {
  it('renders nothing when both sections are disabled', () => {
    const renderer = render({ transcriptEnabled: false, meetingEnabled: false });
    expect(renderer.root.findAllByProps({ testID: 'loading-state' })).toHaveLength(0);
  });

  it('shows loading for transcript while its query is pending', () => {
    const renderer = render();
    expect(renderer.root.findAllByProps({ testID: 'loading-state' }).length).toBeGreaterThan(0);
  });

  it('renders transcript results and calls onTranscriptPress on tap', () => {
    const onTranscriptPress = jest.fn();
    const renderer = render({
      onTranscriptPress,
      semanticQuery: {
        isPending: false,
        isError: false,
        data: {
          pages: [
            {
              items: [{ chunk_id: 'c1', meeting_id: 'm1', meeting_title: 'Sprint', meeting_date: null, excerpt: 'x', segment_seq: 3, segment_end_seq: 3, score: 0.5 }],
              next_offset: null,
            },
          ],
        },
        hasNextPage: false,
        isFetchingNextPage: false,
        refetch: jest.fn(),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test double for the query result shape
      } as any,
    });
    expect(allTexts(renderer)).toContain('Transcript (1)');
    act(() => {
      renderer.root.findByProps({ leading: 'waveform' }).props.onPress();
    });
    expect(onTranscriptPress).toHaveBeenCalledWith('m1', 3);
  });

  it('renders meeting results and calls onMeetingPress on tap', () => {
    const onMeetingPress = jest.fn();
    const renderer = render({
      onMeetingPress,
      meetingQuery: {
        isPending: false,
        isError: false,
        data: {
          pages: [
            {
              items: [
                { id: 'm2', title: 'Client Discussion', status: 'ready', source_language: 'vi', translate_to: null, started_at: null, ended_at: null, duration_sec: null, created_at: '2026-01-01T00:00:00.000Z' },
              ],
              next_cursor: null,
            },
          ],
        },
        hasNextPage: false,
        isFetchingNextPage: false,
        refetch: jest.fn(),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test double for the query result shape
      } as any,
    });
    expect(allTexts(renderer)).toContain('Cuộc họp (1)');
    act(() => {
      renderer.root.findByProps({ title: 'Client Discussion' }).props.onPress();
    });
    expect(onMeetingPress).toHaveBeenCalledWith('m2');
  });
});
