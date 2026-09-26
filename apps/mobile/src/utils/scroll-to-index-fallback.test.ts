import { createScrollToIndexFallback } from './scroll-to-index-fallback';

describe('createScrollToIndexFallback', () => {
  it('approximates the target offset from the average measured row height', () => {
    const scrollToOffset = jest.fn();
    const handler = createScrollToIndexFallback({ current: { scrollToOffset } } as never);

    handler({ averageItemLength: 40, highestMeasuredFrameIndex: 5, index: 20 });

    expect(scrollToOffset).toHaveBeenCalledWith({ animated: false, offset: 800 });
  });

  it('does nothing when the list ref is not yet attached', () => {
    const handler = createScrollToIndexFallback({ current: null });
    expect(() => handler({ averageItemLength: 40, highestMeasuredFrameIndex: 5, index: 20 })).not.toThrow();
  });
});
