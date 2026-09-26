import TestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import type { QaMessage } from '@meetio/shared';
import { QaAssistantBubble } from './qa-assistant-bubble';

function assistantMessage(overrides: Partial<QaMessage> = {}): QaMessage {
  return {
    id: 'a1',
    role: 'assistant',
    content: 'Bình phụ trách API.',
    citations: [],
    confidence: 0.8,
    not_found: false,
    low_confidence: false,
    filters: null,
    created_at: '2026-05-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('QaAssistantBubble', () => {
  let renderer: TestRenderer.ReactTestRenderer | undefined;
  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  function allTexts() {
    return renderer!.root.findAllByType(Text).map((node) => node.props.children).flat();
  }

  it('renders the answer text and its citation chips, tappable to onCitationPress', () => {
    const onCitationPress = jest.fn();
    const citation = {
      chunk_id: 'c1',
      meeting_id: 'm1',
      meeting_title: 'Sprint Review',
      meeting_date: '2026-05-03T00:00:00.000Z',
      segment_seq: 4,
      excerpt: 'x',
      available: true,
    };
    act(() => {
      renderer = TestRenderer.create(
        <QaAssistantBubble message={assistantMessage({ citations: [citation] })} onCitationPress={onCitationPress} />,
      );
    });
    expect(allTexts()).toContain('Bình phụ trách API.');
    act(() => renderer!.root.findByProps({ testID: 'citation-chip-c1' }).props.onPress());
    expect(onCitationPress).toHaveBeenCalledWith(citation);
  });

  it('renders a plain not-found notice and no citations when not_found is true', () => {
    act(() => {
      renderer = TestRenderer.create(
        <QaAssistantBubble
          message={assistantMessage({ not_found: true, content: '', confidence: 0 })}
          onCitationPress={jest.fn()}
        />,
      );
    });
    expect(allTexts()).toContain('Không tìm thấy thông tin liên quan trong các cuộc họp.');
  });

  it('shows a low-confidence warning line alongside the answer', () => {
    act(() => {
      renderer = TestRenderer.create(
        <QaAssistantBubble message={assistantMessage({ low_confidence: true })} onCitationPress={jest.fn()} />,
      );
    });
    expect(allTexts()).toContain('Câu trả lời chưa có nguồn chắc chắn.');
  });
});
