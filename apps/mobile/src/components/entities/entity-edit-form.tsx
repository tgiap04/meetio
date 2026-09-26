import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { EntityType, UpdateEntityRequest } from '@meetio/shared';
import { SurfaceCard } from '../ui/surface-card';
import { FilterChipRow } from '../ui/filter-chip-row';
import { EDITABLE_ENTITY_TYPES, entityTypeLabel } from '../../utils/entity-type-labels';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';

export interface EntityEditFormProps {
  initialName: string;
  initialType: EntityType;
  saving: boolean;
  onSave: (body: UpdateEntityRequest) => void;
  onCancel: () => void;
}

const TYPE_CHIPS = EDITABLE_ENTITY_TYPES.map((type) => ({ key: type, label: entityTypeLabel(type) }));

/** Inline edit form for the entity-detail screen's name/type (US-40, `PATCH
 *  /entities/:id`) — editing marks the entity `is_user_edited`, so the
 *  extraction pipeline never overwrites this again. */
export function EntityEditForm({ initialName, initialType, saving, onSave, onCancel }: EntityEditFormProps) {
  const [name, setName] = useState(initialName);
  const [type, setType] = useState<EntityType>(initialType);

  const trimmedName = name.trim();
  const canSave = trimmedName.length > 0 && !saving;

  function handleSave() {
    if (!canSave) {
      return;
    }
    onSave({ canonical_name: trimmedName, type });
  }

  return (
    <SurfaceCard>
      <Text style={styles.label}>Tên</Text>
      <TextInput onChangeText={setName} style={styles.input} testID="entity-edit-name-input" value={name} />
      <Text style={styles.label}>Loại</Text>
      <FilterChipRow activeKey={type} chips={TYPE_CHIPS} onChange={(key) => setType(key as EntityType)} />
      <View style={styles.actions}>
        <Pressable accessibilityRole="button" onPress={onCancel} style={styles.cancelButton}>
          <Text style={styles.cancelLabel}>Hủy</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={!canSave}
          onPress={handleSave}
          style={[styles.saveButton, !canSave && styles.saveButtonDisabled]}
        >
          <Text style={styles.saveLabel}>{saving ? 'Đang lưu…' : 'Lưu'}</Text>
        </Pressable>
      </View>
    </SurfaceCard>
  );
}

const styles = StyleSheet.create({
  label: { ...typography.caption, color: colors.textMuted, marginBottom: 4, marginTop: 8 },
  input: {
    ...typography.body,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 16 },
  cancelButton: { paddingHorizontal: 16, paddingVertical: 10 },
  cancelLabel: { ...typography.button, color: colors.textMuted },
  saveButton: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8, backgroundColor: colors.primary },
  saveButtonDisabled: { opacity: 0.5 },
  saveLabel: { ...typography.button, color: colors.primaryText },
});
