import TestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { MeetingSummarySection } from './meeting-summary-section';
import type { MeetingSummary } from '../../mocks/types';

const SUMMARY: MeetingSummary = {
  meetingId: 'sprint-review',
  paragraph: 'Cuộc họp tập trung vào tiến độ phát triển API.',
};

describe('MeetingSummarySection', () => {
  it('renders the heading and the paragraph verbatim', () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<MeetingSummarySection summary={SUMMARY} />);
    });
    const texts = renderer.root.findAllByType(Text).map((node) => node.props.children).flat().join('');
    expect(texts).toContain('Tóm tắt nội dung');
    expect(texts).toContain(SUMMARY.paragraph);
  });
});
