import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';

/**
 * The "hoặc" rule that separates the email form from the Google button.
 *
 * It is a labelled separator rather than plain whitespace because the word
 * carries meaning: it tells the reader the two blocks are alternatives, not
 * steps. A screen reader announces "hoặc" between the two groups for the same
 * reason. The flanking rules are empty Views, so they contribute nothing to the
 * accessibility tree — they are the only decoration here.
 *
 * `colors.border` is deliberately low contrast: this design separates with tone,
 * not lines (see the note in `theme/colors.ts`). A solid 1px is used rather than
 * `StyleSheet.hairlineWidth` because at hairline weight a #EAE4DA rule on a
 * #F9F6F0 ground stops rendering at all on 1x displays.
 *
 * Purely presentational — no hooks, no routing, no network (phase 05 contract).
 */
export interface AuthDividerProps {
  label?: string;
  /**
   * Optional, and additive to the handover contract in the phase file: the
   * phase's non-functional requirements ask every component here to accept a
   * `testID` so phases 06/07 can assert the divider is present. Optional props
   * cannot break a consumer that omits them.
   */
  testID?: string;
}

export function AuthDivider({ label = 'hoặc', testID }: AuthDividerProps) {
  return (
    <View testID={testID} style={styles.row}>
      <View style={styles.rule} />
      <Text style={styles.label}>{label}</Text>
      <View style={styles.rule} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  rule: { flex: 1, height: 1, backgroundColor: colors.border },
  label: { ...typography.caption, color: colors.textMuted, marginHorizontal: 12 },
});
