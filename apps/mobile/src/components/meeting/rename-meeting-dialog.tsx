import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useKeyboardHeight } from '../qa/qa-keyboard-aware-container';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';

export const MEETING_TITLE_MAX_LENGTH = 200;

export interface RenameMeetingDialogProps {
  visible: boolean;
  /** The meeting's current title; prefills the field and defines "unchanged". */
  initialTitle: string;
  saving: boolean;
  /** Inline failure copy; the dialog stays open while it is set. */
  errorMessage: string | null;
  onCancel: () => void;
  /** Receives the TRIMMED text — an empty string asks the server for its default title. */
  onSave: (title: string) => void;
}

/**
 * Shared rename dialog (Library swipe action + meeting detail pencil). A blank
 * title is valid on purpose: the server substitutes its time-based default, so
 * the helper line says so instead of blocking Save.
 */
const ignoreBack = () => undefined;

export function RenameMeetingDialog({
  visible,
  initialTitle,
  saving,
  errorMessage,
  onCancel,
  onSave,
}: RenameMeetingDialogProps) {
  const [draft, setDraft] = useState(initialTitle);
  const keyboardHeight = useKeyboardHeight();

  // Re-prefill every time the dialog opens (possibly for a different meeting).
  useEffect(() => {
    if (visible) {
      setDraft(initialTitle);
    }
  }, [visible, initialTitle]);

  const trimmed = draft.trim();
  const canSave = !saving && trimmed !== initialTitle;

  function submit() {
    if (canSave) {
      onSave(trimmed);
    }
  }

  return (
    <Modal
      animationType="fade"
      navigationBarTranslucent
      // Required on Android; while saving, Back is swallowed so the PATCH can't be orphaned.
      onRequestClose={saving ? ignoreBack : onCancel}
      statusBarTranslucent
      testID="rename-meeting-dialog"
      transparent
      visible={visible}
    >
      <View style={[styles.scrim, { paddingBottom: keyboardHeight }]}>
        <View accessibilityViewIsModal style={styles.card}>
          <Text accessibilityRole="header" style={styles.title}>
            Đổi tên cuộc họp
          </Text>
          <TextInput
            accessibilityLabel="Tên cuộc họp"
            autoFocus
            editable={!saving}
            maxLength={MEETING_TITLE_MAX_LENGTH}
            onChangeText={setDraft}
            onSubmitEditing={submit}
            returnKeyType="done"
            selectTextOnFocus
            style={styles.input}
            value={draft}
          />
          <View style={styles.hintRow}>
            <Text style={styles.helper}>Để trống để dùng tên mặc định</Text>
            <Text style={styles.counter}>{`${draft.length}/${MEETING_TITLE_MAX_LENGTH}`}</Text>
          </View>
          {errorMessage ? (
            <Text accessibilityRole="alert" style={styles.error}>
              {errorMessage}
            </Text>
          ) : null}
          <View style={styles.actions}>
            <Pressable
              accessibilityLabel="Hủy"
              accessibilityRole="button"
              accessibilityState={{ disabled: saving }}
              disabled={saving}
              onPress={saving ? undefined : onCancel}
              style={[styles.button, saving && styles.disabled]}
            >
              <Text style={styles.cancelLabel}>Hủy</Text>
            </Pressable>
            <Pressable
              accessibilityLabel="Lưu"
              accessibilityRole="button"
              accessibilityState={{ disabled: !canSave, busy: saving }}
              disabled={!canSave}
              onPress={submit}
              style={[styles.button, styles.saveButton, !canSave && styles.disabled]}
            >
              {saving ? (
                <ActivityIndicator color={colors.primaryText} testID="rename-meeting-spinner" />
              ) : (
                <Text style={styles.saveLabel}>Lưu</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 24,
  },
  card: { backgroundColor: colors.background, borderRadius: 16, padding: 20, gap: 12 },
  title: { ...typography.heading, color: colors.text },
  input: {
    ...typography.body,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: colors.surface,
  },
  hintRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  helper: { ...typography.caption, color: colors.textMuted, flex: 1 },
  counter: { ...typography.caption, color: colors.textMuted },
  error: { ...typography.caption, color: colors.danger },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 4 },
  button: {
    minWidth: 88,
    minHeight: 44,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  saveButton: { backgroundColor: colors.primary },
  disabled: { opacity: 0.5 },
  cancelLabel: { ...typography.button, color: colors.text },
  saveLabel: { ...typography.button, color: colors.primaryText },
});
