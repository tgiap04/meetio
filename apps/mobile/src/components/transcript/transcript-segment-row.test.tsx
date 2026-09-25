import TestRenderer, { act } from 'react-test-renderer';
import { Text, TextInput } from 'react-native';
import type { TranscriptSegmentItem } from '@meetio/shared';
import { TranscriptSegmentRow } from './transcript-segment-row';

function segment(overrides: Partial<TranscriptSegmentItem> = {}): TranscriptSegmentItem {
  return {
    id: 's1',
    seq: 1,
    text: 'Xin chào mọi người',
    started_at_ms: 65_000,
    ended_at_ms: 68_000,
    gap_before_ms: null,
    is_edited: false,
    translated_text: null,
    translated_to: null,
    ...overrides,
  };
}

function render(props: Partial<Parameters<typeof TranscriptSegmentRow>[0]> = {}) {
  const merged = { segment: segment(), onSave: jest.fn(), ...props };
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<TranscriptSegmentRow {...merged} />);
  });
  return { renderer, onSave: merged.onSave };
}

describe('TranscriptSegmentRow', () => {
  it('shows the mm:ss timestamp and the text', () => {
    const { renderer } = render();
    const texts = renderer.root.findAllByType(Text).map((n) => n.props.children);
    expect(texts).toContain('01:05');
    expect(texts).toContain('Xin chào mọi người');
  });

  it('shows a gap marker when gap_before_ms is set', () => {
    const { renderer } = render({ segment: segment({ gap_before_ms: 3_000 }) });
    const texts = renderer.root.findAllByType(Text).map((n) => n.props.children);
    expect(texts).toContain('— Khoảng lặng 3s —');
  });

  it('renders no gap marker when gap_before_ms is null', () => {
    const { renderer } = render();
    const texts = renderer.root.findAllByType(Text).map((n) => n.props.children);
    expect(texts.join(' ')).not.toContain('Khoảng lặng');
  });

  it('shows the "đã sửa" badge once the segment has been edited', () => {
    const { renderer } = render({ segment: segment({ is_edited: true }) });
    const texts = renderer.root.findAllByType(Text).map((n) => n.props.children);
    expect(texts).toContain('đã sửa');
  });

  it('enters edit mode on tap and saves the trimmed text on blur', () => {
    const { renderer, onSave } = render();
    act(() => {
      renderer.root.findByProps({ accessibilityLabel: 'Sửa đoạn 01:05' }).props.onPress();
    });
    act(() => {
      renderer.root.findByType(TextInput).props.onChangeText('  Xin chào các bạn  ');
    });
    act(() => {
      renderer.root.findByType(TextInput).props.onBlur();
    });
    expect(onSave).toHaveBeenCalledWith('Xin chào các bạn');
  });

  it('does not save when the text is unchanged', () => {
    const { renderer, onSave } = render();
    act(() => {
      renderer.root.findByProps({ accessibilityLabel: 'Sửa đoạn 01:05' }).props.onPress();
    });
    act(() => {
      renderer.root.findByType(TextInput).props.onBlur();
    });
    expect(onSave).not.toHaveBeenCalled();
  });

  it('does not save an emptied-out segment', () => {
    const { renderer, onSave } = render();
    act(() => {
      renderer.root.findByProps({ accessibilityLabel: 'Sửa đoạn 01:05' }).props.onPress();
    });
    act(() => {
      renderer.root.findByType(TextInput).props.onChangeText('   ');
    });
    act(() => {
      renderer.root.findByType(TextInput).props.onBlur();
    });
    expect(onSave).not.toHaveBeenCalled();
  });

  it('renders the translated text card when present', () => {
    const { renderer } = render({ segment: segment({ translated_text: 'Hello everyone' }) });
    const texts = renderer.root.findAllByType(Text).map((n) => n.props.children);
    expect(texts).toContain('Hello everyone');
  });
});
