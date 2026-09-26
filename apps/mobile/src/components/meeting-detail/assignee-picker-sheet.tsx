import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SearchField } from '../ui/search-field';
import { SurfaceCard } from '../ui/surface-card';
import { LoadingState } from '../loading-state';
import { useInfiniteEntitiesQuery } from '../../hooks/use-entities-query';
import { useDebouncedValue } from '../../hooks/use-debounced-value';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';

const SEARCH_DEBOUNCE_MS = 300;
const SEARCH_PLACEHOLDER = 'Tìm theo tên…';

export interface AssigneePickerSheetProps {
  visible: boolean;
  onClose: () => void;
  /** `null` for both id and name is "Không ai" — clears the assignee. */
  onSelect: (assigneeEntityId: string | null, assigneeName: string | null) => void;
}

/**
 * Modal list of person entities to assign an action item to (US-33). Only
 * ever searches `type=person` — an action item's assignee is always a
 * person, never a project or topic entity. "Không ai" is always the first
 * row, ahead of any search result, so clearing is never harder to reach than
 * picking someone.
 */
export function AssigneePickerSheet({ visible, onClose, onSelect }: AssigneePickerSheetProps) {
  const [queryText, setQueryText] = useState('');
  const debouncedQuery = useDebouncedValue(queryText.trim(), SEARCH_DEBOUNCE_MS);

  const entitiesQuery = useInfiniteEntitiesQuery(
    { type: 'person', q: debouncedQuery === '' ? undefined : debouncedQuery },
    visible,
  );
  const people = useMemo(() => entitiesQuery.data?.pages.flatMap((page) => page.items) ?? [], [entitiesQuery.data]);

  function handleClose() {
    setQueryText('');
    onClose();
  }

  function handleSelectNone() {
    onSelect(null, null);
    handleClose();
  }

  function handleSelectPerson(id: string, name: string) {
    onSelect(id, name);
    handleClose();
  }

  return (
    <Modal animationType="slide" onRequestClose={handleClose} transparent visible={visible}>
      <View style={styles.backdrop}>
        <SurfaceCard style={styles.sheet}>
          <Text style={styles.title}>Chọn người phụ trách</Text>
          <SearchField onChangeText={setQueryText} placeholder={SEARCH_PLACEHOLDER} value={queryText} />
          <Pressable accessibilityRole="button" onPress={handleSelectNone} style={styles.row} testID="assignee-picker-none">
            <Text style={styles.rowLabel}>Không ai</Text>
          </Pressable>
          {entitiesQuery.isPending ? (
            <LoadingState label="Đang tải…" />
          ) : (
            <FlatList
              data={people}
              keyExtractor={(person) => person.id}
              renderItem={({ item: person }) => (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => handleSelectPerson(person.id, person.canonical_name)}
                  style={styles.row}
                >
                  <Text style={styles.rowLabel}>{person.canonical_name}</Text>
                </Pressable>
              )}
              style={styles.list}
            />
          )}
          <Pressable accessibilityRole="button" onPress={handleClose} style={styles.cancelRow}>
            <Text style={styles.cancelLabel}>Hủy</Text>
          </Pressable>
        </SurfaceCard>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { gap: 12, maxHeight: '75%', borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
  title: { ...typography.sectionTitle, color: colors.text },
  list: { flexGrow: 0 },
  row: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  rowLabel: { ...typography.body, color: colors.text },
  cancelRow: { alignItems: 'center', paddingVertical: 10 },
  cancelLabel: { ...typography.button, color: colors.primaryStrong },
});
