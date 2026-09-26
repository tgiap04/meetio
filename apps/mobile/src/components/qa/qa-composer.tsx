import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { AppIcon } from '../icons/app-icon';
import { colors } from '../../theme/colors';

export interface QaComposerProps {
  onSend: (question: string) => void;
  placeholder: string;
  disabled?: boolean;
  sending?: boolean;
}

/** The question input row (US-35→37). 1–1000 chars per the API contract;
 *  disabled while a question is in flight or the thread is blocked (e.g.
 *  MEETING_NOT_READY — the caller passes `disabled` in that case). */
export function QaComposer({ onSend, placeholder, disabled = false, sending = false }: QaComposerProps) {
  const [text, setText] = useState('');
  const trimmed = text.trim();
  const isBlocked = disabled || sending;
  const canSend = !isBlocked && trimmed.length > 0 && trimmed.length <= 1000;

  function handleSend() {
    if (!canSend) {
      return;
    }
    onSend(trimmed);
    setText('');
  }

  return (
    <View style={styles.row}>
      <TextInput
        editable={!isBlocked}
        maxLength={1000}
        multiline
        onChangeText={setText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        style={styles.input}
        testID="qa-composer-input"
        value={text}
      />
      <Pressable
        accessibilityLabel="Gửi câu hỏi"
        accessibilityRole="button"
        disabled={!canSend}
        onPress={handleSend}
        style={[styles.sendButton, !canSend && styles.sendButtonDisabled]}
        testID="qa-composer-send"
      >
        <AppIcon color={colors.primaryText} name="chevronRight" size={20} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 12, backgroundColor: colors.background },
  input: {
    flex: 1,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    maxHeight: 120,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: { opacity: 0.4 },
});
