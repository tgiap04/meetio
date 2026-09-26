import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useDebouncedValue } from '../../hooks/use-debounced-value';
import { useEntitySearchQuery } from '../../hooks/use-entity-search-query';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';

export interface QaEntityFilterPickerProps {
  selectedName: string | null;
  onSelect: (entityId: string, name: string) => void;
  onClear: () => void;
}

/** "Lọc theo thực thể" — search-and-pick for the global Q&A composer (US-39).
 *  Once an entity is selected it collapses to a single clearable chip. */
export function QaEntityFilterPicker({ selectedName, onSelect, onClear }: QaEntityFilterPickerProps) {
  const [query, setQuery] = useState('');
  const debounced = useDebouncedValue(query, 300);
  const searchQuery = useEntitySearchQuery(debounced);

  if (selectedName) {
    return (
      <Pressable
        accessibilityLabel={`Bỏ lọc thực thể ${selectedName}`}
        accessibilityRole="button"
        onPress={onClear}
        style={styles.selectedChip}
        testID="qa-entity-filter-selected"
      >
        <Text style={styles.selectedText}>{selectedName} ✕</Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.container}>
      <TextInput
        onChangeText={setQuery}
        placeholder="Lọc theo thực thể…"
        placeholderTextColor={colors.textMuted}
        style={styles.input}
        testID="qa-entity-filter-input"
        value={query}
      />
      {searchQuery.data && searchQuery.data.items.length > 0 ? (
        <FlatList
          data={searchQuery.data.items}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                onSelect(item.id, item.canonical_name);
                setQuery('');
              }}
              style={styles.suggestionRow}
            >
              <Text style={styles.suggestionText}>{item.canonical_name}</Text>
            </Pressable>
          )}
          style={styles.suggestions}
          testID="qa-entity-filter-suggestions"
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 4 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: colors.text,
  },
  suggestions: { maxHeight: 160, backgroundColor: colors.background, borderRadius: 8 },
  suggestionRow: { paddingHorizontal: 12, paddingVertical: 10 },
  suggestionText: { ...typography.body, color: colors.text },
  selectedChip: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primaryTint,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  selectedText: { ...typography.caption, color: colors.primaryStrong },
});
