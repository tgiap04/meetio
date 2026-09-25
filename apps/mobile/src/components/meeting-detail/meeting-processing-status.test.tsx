import TestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { MeetingStatus, ProcessingStep } from '@meetio/shared';
import { MeetingProcessingStatus } from './meeting-processing-status';

function render(props: Partial<Parameters<typeof MeetingProcessingStatus>[0]> = {}) {
  const merged = {
    status: MeetingStatus.PROCESSING,
    processingSteps: [],
    failureReason: null,
    onRetry: jest.fn(),
    retryLoading: false,
    ...props,
  };
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<MeetingProcessingStatus {...merged} />);
  });
  return renderer;
}

describe('MeetingProcessingStatus', () => {
  it('renders nothing when the meeting is ready', () => {
    const renderer = render({ status: MeetingStatus.READY });
    expect(renderer.toJSON()).toBeNull();
  });

  it('shows the current step label while processing', () => {
    const renderer = render({
      status: MeetingStatus.PROCESSING,
      processingSteps: [
        { step: ProcessingStep.CHUNK, status: 'succeeded', attempts: 1, error_message: null },
        { step: ProcessingStep.EMBED, status: 'running', attempts: 1, error_message: null },
      ],
    });
    const texts = renderer.root.findAllByType(Text).map((n) => n.props.children);
    expect(texts).toContain('Đang tạo embedding');
  });

  it('shows a generic label while queued with no steps reported yet', () => {
    const renderer = render({ status: MeetingStatus.QUEUED, processingSteps: [] });
    const texts = renderer.root.findAllByType(Text).map((n) => n.props.children);
    expect(texts).toContain('Đang chia đoạn âm thanh');
  });

  it('shows the failure reason and a retry button when failed', () => {
    const onRetry = jest.fn();
    const renderer = render({ status: MeetingStatus.FAILED, failureReason: 'Model quá tải', onRetry });
    const texts = renderer.root.findAllByType(Text).map((n) => n.props.children);
    expect(texts).toContain('Model quá tải');
    act(() => {
      renderer.root.findByProps({ accessibilityRole: 'button' }).props.onPress();
    });
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('falls back to a default message when failure_reason is null', () => {
    const renderer = render({ status: MeetingStatus.FAILED, failureReason: null });
    const texts = renderer.root.findAllByType(Text).map((n) => n.props.children);
    expect(texts).toContain('Xử lý thất bại. Vui lòng thử lại.');
  });
});
