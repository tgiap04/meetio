import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SearchField } from '../ui/search-field';
import { FilterChipRow } from '../ui/filter-chip-row';
import { ScreenHeader } from '../ui/screen-header';
import { AppIcon } from '../icons/app-icon';
import { ENTITY_TYPE_CHIPS, type EntityChipKey } from '../../utils/entity-type-labels';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';

export interface EntitiesListHeaderProps {
  onBack: () => void;
  queryText: string;
  onQueryTextChange: (text: string) => void;
  activeChip: EntityChipKey;
  onChipChange: (chip: EntityChipKey) => void;
  mergeSuggestionCount: number;
  onMergeSuggestionsPress: () => void;
}

const SEARCH_PLACEHOLDER = 'Tìm theo tên thực thể…';

/** Header block for the entity-list screen: back + title, search box, type
 *  chips, and the "Xem đề xuất gộp (N)" entry point (US-41). */
export function EntitiesListHeader({
  onBack,
  queryText,
  onQueryTextChange,
  activeChip,
  onChipChange,
  mergeSuggestionCount,
  onMergeSuggestionsPress,
}: EntitiesListHeaderProps) {
  return (
    <View style={styles.container}>
      <ScreenHeader onBack={onBack} title="Thực thể" />
      <View style={styles.body}>
        <SearchField onChangeText={onQueryTextChange} placeholder={SEARCH_PLACEHOLDER} value={queryText} />
        <FilterChipRow
          activeKey={activeChip}
          chips={[...ENTITY_TYPE_CHIPS]}
          onChange={(key) => onChipChange(key as EntityChipKey)}
        />
        {mergeSuggestionCount > 0 ? (
          <Pressable accessibilityRole="button" onPress={onMergeSuggestionsPress} style={styles.mergeRow}>
            <AppIcon color={colors.primaryStrong} name="merge" size={18} />
            <Text style={styles.mergeLabel}>{`Xem đề xuất gộp (${mergeSuggestionCount})`}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 12 },
  body: { paddingHorizontal: 16, gap: 12 },
  mergeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  mergeLabel: { ...typography.label, color: colors.primaryStrong },
});
