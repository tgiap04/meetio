import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';

/**
 * "Tìm kiếm" title for the Search tab. Unlike `ScreenHeader` (P01), this
 * carries no back chevron and no `onBack` — this screen is a tab root, not a
 * stacked screen pushed onto the nav stack, so there is nowhere to go back
 * to. Same rule P10 (Library tab) follows.
 */
export function SearchHeader() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Tìm kiếm</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingBottom: 4 },
  title: { ...typography.heading, color: colors.text },
});
