import { Pressable, StyleSheet, Text } from 'react-native';
import { AppIcon } from '../icons/app-icon';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';

export interface AskAiFabProps {
  onPress: () => void;
}

/** Floating "Hỏi AI" button on meeting detail (US-35) — the sole entry
 *  point into the meeting-scoped Q&A chat (clarifications.md 2026-09-26). */
export function AskAiFab({ onPress }: AskAiFabProps) {
  return (
    <Pressable accessibilityLabel="Hỏi AI" accessibilityRole="button" onPress={onPress} style={styles.fab} testID="ask-ai-fab">
      <AppIcon color={colors.primaryText} name="sparkle" size={18} />
      <Text style={styles.label}>Hỏi AI</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  label: { ...typography.button, color: colors.primaryText },
});
