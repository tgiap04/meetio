import TestRenderer, { act } from 'react-test-renderer';
import { FlatList, StyleSheet } from 'react-native';
import { LIVE_LIST_BOTTOM_PADDING, LiveTranscriptList } from './live-transcript-list';

let mockBottomInset = 0;
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, left: 0, right: 0, bottom: mockBottomInset }),
}));

const mounted: TestRenderer.ReactTestRenderer[] = [];
afterEach(() => act(() => mounted.splice(0).forEach((r) => r.unmount())));

function contentPaddingBottom(): number {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<LiveTranscriptList lines={[{ seq: 1, text: 'a very long line', startedAtMs: 0, endedAtMs: 1, gapBeforeMs: null }]} partial={null} />);
  });
  mounted.push(renderer);
  const style = StyleSheet.flatten(renderer.root.findByType(FlatList).props.contentContainerStyle);
  return style.paddingBottom as number;
}

describe('LiveTranscriptList bottom spacing', () => {
  it('leaves comfortable room under the last line (padding + base inset)', () => {
    mockBottomInset = 0;
    expect(contentPaddingBottom()).toBe(16 + LIVE_LIST_BOTTOM_PADDING);
  });

  it('adds the device bottom inset (gesture bar / rounded corners) on top', () => {
    mockBottomInset = 34;
    expect(contentPaddingBottom()).toBe(16 + LIVE_LIST_BOTTOM_PADDING + 34);
  });

  it('keeps the side and top padding of the list unchanged', () => {
    mockBottomInset = 20;
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<LiveTranscriptList lines={[]} partial={null} />);
    });
    mounted.push(renderer);
    const style = StyleSheet.flatten(renderer.root.findByType(FlatList).props.contentContainerStyle);
    expect(style).toMatchObject({ padding: 16, gap: 12 });
  });
});
