import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { AppIcon } from '../icons/app-icon';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';

export interface SearchFieldProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  /** Screen-12/13 both show a funnel button beside the field; screen-09 omits it. */
  onFilterPress?: () => void;
}

/** Magnifier + text input, optional trailing filter button — screens 09/12/13. */
export function SearchField({ value, onChangeText, placeholder, onFilterPress }: SearchFieldProps) {
  return (
    <View style={styles.row}>
      <View style={styles.field}>
        <AppIcon color={colors.textMuted} name="search" size={18} />
        <TextInput
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          style={styles.input}
          value={value}
        />
      </View>
      {onFilterPress ? (
        <Pressable accessibilityLabel="Bộ lọc" accessibilityRole="button" onPress={onFilterPress} style={styles.filterButton}>
          <AppIcon color={colors.textMuted} name="filter" size={18} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  field: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  input: { ...typography.body, color: colors.text, flex: 1, padding: 0 },
  filterButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
