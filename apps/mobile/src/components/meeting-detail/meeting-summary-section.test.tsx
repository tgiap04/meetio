import TestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import type { SummaryCitation } from '@meetio/shared';
import { MeetingSummarySection, type MeetingSummarySectionProps } from './meeting-summary-section';

const POINT: SummaryCitation = { kind: 'point', text: 'Đã chốt lịch phát hành', chunk_ids: ['c1'], segment_seq: 3 };
const DECISION: SummaryCitation = { kind: 'decision', text: 'Dời deadline sang thứ Sáu', chunk_ids: ['c2'], segment_seq: 8 };

function render(props: Partial<MeetingSummarySectionProps> = {}) {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <MeetingSummarySection
        decisions={[]}
        hasUnprocessedEdits={false}
        insufficient={false}
        onCitationPress={jest.fn()}
        points={[]}
        summary="Tóm tắt"
        {...props}
      />,
    );
  });
  return renderer;
}

function allText(renderer: TestRenderer.ReactTestRenderer) {
  return renderer.root.findAllByType(Text).map((node) => node.props.children).flat().join('');
}

describe('MeetingSummarySection', () => {
  it('shows "chưa có tóm tắt" when summary is null', () => {
    const renderer = render({ summary: null });
    expect(allText(renderer)).toContain('Chưa có tóm tắt cho cuộc họp này.');
  });

  it('shows the plain-notice sentence, not bullet points, when insufficient', () => {
    const renderer = render({
      summary: 'Cuộc họp quá ngắn để tóm tắt.',
      insufficient: true,
      points: [POINT],
      decisions: [DECISION],
    });
    const texts = allText(renderer);
    expect(texts).toContain('Cuộc họp quá ngắn để tóm tắt.');
    expect(texts).not.toContain('Đã chốt lịch phát hành');
  });

  it('renders points and decisions as separate lists when sufficient', () => {
    const renderer = render({ points: [POINT], decisions: [DECISION] });
    const texts = allText(renderer);
    expect(texts).toContain('Ý chính');
    expect(texts).toContain('Đã chốt lịch phát hành');
    expect(texts).toContain('Quyết định');
    expect(texts).toContain('Dời deadline sang thứ Sáu');
  });

  it('shows the "đang cập nhật" label when there are unprocessed edits', () => {
    const renderer = render({ hasUnprocessedEdits: true });
    expect(allText(renderer)).toContain('Đang cập nhật theo bản chỉnh sửa mới nhất…');
  });

  it('tapping a citation calls onCitationPress with its segment_seq', () => {
    const onCitationPress = jest.fn();
    const renderer = render({ points: [POINT], onCitationPress });
    act(() => {
      renderer.root.findByProps({ accessibilityLabel: POINT.text }).props.onPress();
    });
    expect(onCitationPress).toHaveBeenCalledWith(3);
  });
});
