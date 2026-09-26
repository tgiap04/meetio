import { ActivityIndicator, FlatList, StyleSheet } from 'react-native';
import type { QaCitation, QaMessage } from '@meetio/shared';
import { QaUserBubble } from './qa-user-bubble';
import { QaAssistantBubble } from './qa-assistant-bubble';
import { QaTypingIndicator } from './qa-typing-indicator';
import { QaPendingErrorBubble } from './qa-pending-error-bubble';
import { EmptyState } from '../empty-state';
import { colors } from '../../theme/colors';
import type { QaPendingTurn } from '../../hooks/use-qa-thread';

export interface QaThreadListProps {
  /** Oldest first — the same order `useQaThread.items` produces. */
  items: readonly QaMessage[];
  pending: QaPendingTurn | null;
  onCitationPress: (citation: QaCitation) => void;
  onRetryPending: () => void;
  onLoadOlder: () => void;
  hasOlder: boolean;
  loadingOlder: boolean;
}

type Row =
  | { kind: 'message'; message: QaMessage }
  | { kind: 'pending-question'; text: string }
  | { kind: 'pending-status' };

/**
 * Inverted chat list shared by the meeting and global Q&A screens: newest
 * bubble at the visual bottom, older history loads when the user scrolls
 * toward the top (`onEndReached` in an inverted list fires at the visual
 * top, per React Native's own inverted-list convention).
 */
export function QaThreadList({
  items,
  pending,
  onCitationPress,
  onRetryPending,
  onLoadOlder,
  hasOlder,
  loadingOlder,
}: QaThreadListProps) {
  const rows: Row[] = [...items].reverse().map((message) => ({ kind: 'message', message }));
  if (pending) {
    rows.unshift({ kind: 'pending-status' });
    rows.unshift({ kind: 'pending-question', text: pending.question });
  }

  return (
    <FlatList
      contentContainerStyle={styles.content}
      data={rows}
      inverted
      keyExtractor={(row, index) => (row.kind === 'message' ? row.message.id : `${row.kind}-${index}`)}
      ListEmptyComponent={<EmptyState title="Chưa có câu hỏi nào" />}
      ListFooterComponent={
        loadingOlder ? (
          <ActivityIndicator color={colors.primary} style={styles.footer} testID="qa-history-load-more-spinner" />
        ) : null
      }
      onEndReached={hasOlder && !loadingOlder ? onLoadOlder : undefined}
      onEndReachedThreshold={0.4}
      renderItem={({ item }) => {
        if (item.kind === 'pending-question') {
          return <QaUserBubble content={item.text} />;
        }
        if (item.kind === 'pending-status') {
          return pending?.status === 'error' && pending.errorMessage ? (
            <QaPendingErrorBubble message={pending.errorMessage} onRetry={onRetryPending} />
          ) : (
            <QaTypingIndicator />
          );
        }
        return item.message.role === 'user' ? (
          <QaUserBubble content={item.message.content} filters={item.message.filters} />
        ) : (
          <QaAssistantBubble message={item.message} onCitationPress={onCitationPress} />
        );
      }}
      style={styles.list}
    />
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: colors.surface },
  content: { padding: 16, gap: 12 },
  footer: { paddingVertical: 12 },
});
