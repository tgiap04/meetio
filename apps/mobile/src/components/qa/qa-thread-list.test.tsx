import TestRenderer, { act } from 'react-test-renderer';
import { FlatList } from 'react-native';
import { QaThreadList } from './qa-thread-list';
import { QaUserBubble } from './qa-user-bubble';
import { QaTypingIndicator } from './qa-typing-indicator';
import { QaPendingErrorBubble } from './qa-pending-error-bubble';
import type { QaPendingTurn } from '../../hooks/use-qa-thread';

const noop = () => undefined;

function render(pending: QaPendingTurn | null, items: never[] = []) {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <QaThreadList
        hasOlder={false}
        items={items}
        loadingOlder={false}
        onCitationPress={noop}
        onLoadOlder={noop}
        onRetryPending={noop}
        pending={pending}
      />,
    );
  });
  return renderer;
}

describe('QaThreadList', () => {
  it('renders the empty state outside the inverted list so it is not flipped', () => {
    const renderer = render(null);
    expect(renderer.root.findAllByType(FlatList)).toHaveLength(0);
    expect(renderer.root.findAllByProps({ testID: 'empty-state' }).length).toBeGreaterThan(0);
    act(() => renderer.unmount());
  });

  it('orders the pending turn so the status bubble sits below the question in an inverted list', () => {
    const renderer = render({ question: 'Hỏi gì?', status: 'sending' } as QaPendingTurn);
    const data = renderer.root.findByType(FlatList).props.data as { kind: string }[];
    // Inverted: lower index = lower on screen.
    expect(data.map((row) => row.kind)).toEqual(['pending-status', 'pending-question']);
    expect(renderer.root.findAllByType(QaUserBubble)).toHaveLength(1);
    expect(renderer.root.findAllByType(QaTypingIndicator)).toHaveLength(1);
    act(() => renderer.unmount());
  });

  it('shows the error bubble in the status slot when the pending turn failed', () => {
    const renderer = render({ question: 'Hỏi gì?', status: 'error', errorMessage: 'Lỗi' } as QaPendingTurn);
    const data = renderer.root.findByType(FlatList).props.data as { kind: string }[];
    expect(data[0]?.kind).toBe('pending-status');
    expect(renderer.root.findAllByType(QaPendingErrorBubble)).toHaveLength(1);
    act(() => renderer.unmount());
  });
});
