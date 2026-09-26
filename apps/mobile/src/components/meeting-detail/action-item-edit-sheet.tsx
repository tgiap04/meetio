import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { MeetingActionItem } from '@meetio/shared';
import { PrimaryButton } from '../primary-button';
import { SecondaryButton } from '../ui/secondary-button';
import { SurfaceCard } from '../ui/surface-card';
import { AssigneePickerSheet } from './assignee-picker-sheet';
import { formatDueDateForInput, parseDueDateInput } from '../../utils/action-item-format';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';

export interface ActionItemEditSheetPayload {
  content: string;
  assignee_entity_id: string | null;
  due_date: string | null;
}

export interface ActionItemEditSheetProps {
  visible: boolean;
  /** `undefined` for "Thêm việc" (create); a real item for editing it. */
  item?: MeetingActionItem;
  saving: boolean;
  onClose: () => void;
  onSave: (payload: ActionItemEditSheetPayload) => void;
}

const EMPTY_DRAFT = { content: '', assigneeEntityId: null as string | null, assigneeName: null as string | null, dueDateText: '' };

/**
 * Add/edit form for one action item (US-32/33): content, assignee (via
 * `AssigneePickerSheet`), due date (`DD/MM/YYYY` text, parsed at save time).
 * A malformed due date blocks the save with an inline error rather than
 * silently dropping it or storing garbage.
 */
export function ActionItemEditSheet({ visible, item, saving, onClose, onSave }: ActionItemEditSheetProps) {
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [dueDateError, setDueDateError] = useState<string | null>(null);
  const [pickerVisible, setPickerVisible] = useState(false);

  useEffect(() => {
    if (!visible) {
      return;
    }
    setDraft(
      item
        ? {
            content: item.content,
            assigneeEntityId: item.assignee_entity_id,
            assigneeName: item.assignee_name,
            dueDateText: formatDueDateForInput(item.due_date),
          }
        : EMPTY_DRAFT,
    );
    setDueDateError(null);
  }, [visible, item]);

  function handleSave() {
    const parsedDueDate = parseDueDateInput(draft.dueDateText);
    if (!parsedDueDate.valid) {
      setDueDateError('Ngày không hợp lệ, dùng định dạng dd/MM/yyyy.');
      return;
    }
    onSave({
      content: draft.content.trim(),
      assignee_entity_id: draft.assigneeEntityId,
      due_date: parsedDueDate.value,
    });
  }

  const canSave = draft.content.trim().length > 0 && !saving;

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.backdrop}>
        <SurfaceCard style={styles.sheet}>
          <Text style={styles.title}>{item ? 'Sửa việc cần làm' : 'Thêm việc cần làm'}</Text>

          <Text style={styles.fieldLabel}>Nội dung</Text>
          <TextInput
            accessibilityLabel="Nội dung việc cần làm"
            onChangeText={(text) => setDraft((prev) => ({ ...prev, content: text }))}
            style={styles.input}
            value={draft.content}
          />

          <Text style={styles.fieldLabel}>Người phụ trách</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => setPickerVisible(true)}
            style={styles.assigneeField}
            testID="action-item-edit-assignee-field"
          >
            <Text style={styles.assigneeText}>{draft.assigneeName ?? 'Chưa chọn'}</Text>
          </Pressable>

          <Text style={styles.fieldLabel}>Hạn (dd/MM/yyyy)</Text>
          <TextInput
            accessibilityLabel="Hạn việc cần làm"
            onChangeText={(text) => {
              setDraft((prev) => ({ ...prev, dueDateText: text }));
              setDueDateError(null);
            }}
            placeholder="dd/MM/yyyy"
            style={styles.input}
            value={draft.dueDateText}
          />
          {dueDateError ? <Text style={styles.errorText}>{dueDateError}</Text> : null}

          <PrimaryButton disabled={!canSave} label="Lưu" loading={saving} onPress={handleSave} />
          <SecondaryButton label="Hủy" onPress={onClose} />
        </SurfaceCard>
      </View>

      <AssigneePickerSheet
        onClose={() => setPickerVisible(false)}
        onSelect={(assigneeEntityId, assigneeName) =>
          setDraft((prev) => ({ ...prev, assigneeEntityId, assigneeName }))
        }
        visible={pickerVisible}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { gap: 8, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
  title: { ...typography.sectionTitle, color: colors.text, marginBottom: 8 },
  fieldLabel: { ...typography.caption, color: colors.textMuted },
  input: {
    ...typography.body,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  assigneeField: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  assigneeText: { ...typography.body, color: colors.text },
  errorText: { ...typography.caption, color: colors.danger },
});
