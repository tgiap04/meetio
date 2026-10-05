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
    expect(texts).toContain('— Gián đoạn 3 giây —');
  });

  it('renders no gap marker when gap_before_ms is null', () => {
    const { renderer } = render();
    const texts = renderer.root.findAllByType(Text).map((n) => n.props.children);
    expect(texts.join(' ')).not.toContain('Gián đoạn');
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

  it('renders the translated text card when present (side by side)', () => {
    const { renderer } = render({ segment: segment({ translated_text: 'Hello everyone' }), viewMode: 'both', translationEnabled: true });
    const texts = renderer.root.findAllByType(Text).map((n) => n.props.children);
    expect(texts).toContain('Hello everyone');
  });

  describe('view modes (Phase 09)', () => {
    const translated = () => segment({ translated_text: 'Hello everyone', translated_to: 'en-US' });
    const shown = (r: TestRenderer.ReactTestRenderer) => r.root.findAllByType(Text).map((n) => n.props.children);
    const retryButton = (r: TestRenderer.ReactTestRenderer) =>
      r.root.findAll((n) => n.props.accessibilityLabel === 'Thử lại dịch đoạn này' && typeof n.props.onPress === 'function');

    it('original: only the original text, even when a translation exists', () => {
      const { renderer } = render({ segment: translated(), viewMode: 'original', translationEnabled: true });
      expect(shown(renderer)).toContain('Xin chào mọi người');
      expect(shown(renderer)).not.toContain('Hello everyone');
    });

    it('translated: the translation replaces the original', () => {
      const { renderer } = render({ segment: translated(), viewMode: 'translated', translationEnabled: true });
      expect(shown(renderer)).toContain('Hello everyone');
      expect(shown(renderer)).not.toContain('Xin chào mọi người');
    });

    it('both: original with the translation under it', () => {
      const { renderer } = render({ segment: translated(), viewMode: 'both', translationEnabled: true });
      const all = shown(renderer);
      expect(all.indexOf('Hello everyone')).toBe(all.indexOf('Xin chào mọi người') + 1);
    });

    it('an untranslated segment of a translated meeting offers "Thử lại" in translated and both modes, never in original', () => {
      const onRetryTranslation = jest.fn();
      for (const viewMode of ['translated', 'both'] as const) {
        const { renderer } = render({ viewMode, translationEnabled: true, onRetryTranslation });
        expect(shown(renderer)).toContain('Xin chào mọi người'); // never a blank row
        expect(shown(renderer)).toContain('Chưa dịch được');
        act(() => retryButton(renderer)[0].props.onPress());
      }
      expect(onRetryTranslation).toHaveBeenCalledTimes(2);
      const original = render({ viewMode: 'original', translationEnabled: true, onRetryTranslation });
      expect(retryButton(original.renderer)).toHaveLength(0);
    });

    it('a meeting without translation shows no translation UI at all', () => {
      const { renderer } = render({ viewMode: 'both', translationEnabled: false });
      expect(shown(renderer)).not.toContain('Chưa dịch được');
    });

    it('shows retry progress and error for that segment', () => {
      const { renderer } = render({ viewMode: 'both', translationEnabled: true, onRetryTranslation: jest.fn(), retryingTranslation: true });
      expect(shown(renderer)).toContain('Đang dịch…');
      const failed = render({ viewMode: 'both', translationEnabled: true, onRetryTranslation: jest.fn(), translationError: 'Dịch vụ AI tạm thời không khả dụng.' });
      expect(shown(failed.renderer)).toContain('Dịch vụ AI tạm thời không khả dụng.');
    });

    it('the translated text cannot be edited in place — only the original can', () => {
      const { renderer } = render({ segment: translated(), viewMode: 'translated', translationEnabled: true });
      const press = renderer.root.findAll((n) => typeof n.props.onPress === 'function' && n.props.accessibilityLabel?.startsWith('Sửa đoạn'));
      expect(press).toHaveLength(0);
    });
  });
});
