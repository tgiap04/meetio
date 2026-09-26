import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import type { TranscriptSegmentItem } from '@meetio/shared';
import { useScrollToInitialSeq } from './use-scroll-to-initial-seq';

function segment(seq: number): TranscriptSegmentItem {
  return {
    id: `s${seq}`,
    seq,
    text: 'x',
    started_at_ms: 0,
    ended_at_ms: 0,
    gap_before_ms: null,
    is_edited: false,
    translated_text: null,
    translated_to: null,
  };
}

function Harness({ segments, initialSeq, onScrollToIndex }: {
  segments: TranscriptSegmentItem[];
  initialSeq: number | undefined;
  onScrollToIndex: (index: number) => void;
}) {
  const listRef = { current: { scrollToIndex: (p: { index: number }) => onScrollToIndex(p.index) } } as never;
  useScrollToInitialSeq(segments, initialSeq, listRef);
  return null;
}

function render(props: React.ComponentProps<typeof Harness>) {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<Harness {...props} />);
  });
  return renderer;
}

describe('useScrollToInitialSeq', () => {
  it('does nothing when initialSeq is undefined', () => {
    const onScrollToIndex = jest.fn();
    render({ segments: [segment(1)], initialSeq: undefined, onScrollToIndex });
    expect(onScrollToIndex).not.toHaveBeenCalled();
  });

  it('does nothing while the matching segment has not loaded yet', () => {
    const onScrollToIndex = jest.fn();
    render({ segments: [segment(1)], initialSeq: 42, onScrollToIndex });
    expect(onScrollToIndex).not.toHaveBeenCalled();
  });

  it('scrolls to the segment matching initialSeq once it loads', () => {
    const onScrollToIndex = jest.fn();
    const renderer = render({ segments: [segment(1)], initialSeq: 42, onScrollToIndex });
    act(() => {
      renderer.update(<Harness initialSeq={42} onScrollToIndex={onScrollToIndex} segments={[segment(1), segment(42)]} />);
    });
    expect(onScrollToIndex).toHaveBeenCalledWith(1);
  });

  it('only jumps once, even if segments keep changing after the jump', () => {
    const onScrollToIndex = jest.fn();
    const renderer = render({ segments: [segment(1), segment(42)], initialSeq: 42, onScrollToIndex });
    act(() => {
      renderer.update(
        <Harness initialSeq={42} onScrollToIndex={onScrollToIndex} segments={[segment(1), segment(42), segment(43)]} />,
      );
    });
    expect(onScrollToIndex).toHaveBeenCalledTimes(1);
  });
});
