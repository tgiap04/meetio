import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';

/**
 * Library tab-root header — screen-12's crop draws a back chevron and the
 * title "Hỏi đáp AI", both left over from a designer copy-paste of the
 * missing screen-11 crop (see `clarifications.md` §1). The settled reading
 * is: this is the Thư viện tab, header "Thư viện", no back chevron — a tab
 * root has no screen to return to, unlike `ScreenHeader`'s stacked screens
 * (05/07/09/10/14).
 */
export function LibraryHeader() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Thư viện</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 4, paddingBottom: 4 },
  title: { ...typography.heading, color: colors.text },
});
