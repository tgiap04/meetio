import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { parseQaDateInput } from '../../utils/qa-formatting';

export interface QaDateRangePickerProps {
  onChange: (range: { from: string | null; to: string | null }) => void;
}

/** "Từ ngày" / "Đến ngày" free-text filter for the global Q&A composer
 *  (US-37) — `DD/MM/YYYY`; blank or unparsable text clears that bound. */
export function QaDateRangePicker({ onChange }: QaDateRangePickerProps) {
  const [fromText, setFromText] = useState('');
  const [toText, setToText] = useState('');

  function commit(nextFromText: string, nextToText: string) {
    onChange({ from: parseQaDateInput(nextFromText), to: parseQaDateInput(nextToText) });
  }

  return (
    <View style={styles.row}>
      <View style={styles.field}>
        <Text style={styles.label}>Từ ngày</Text>
        <TextInput
          onChangeText={(text) => {
            setFromText(text);
            commit(text, toText);
          }}
          placeholder="DD/MM/YYYY"
          placeholderTextColor={colors.textMuted}
          style={styles.input}
          testID="qa-date-from-input"
          value={fromText}
        />
      </View>
      <View style={styles.field}>
        <Text style={styles.label}>Đến ngày</Text>
        <TextInput
          onChangeText={(text) => {
            setToText(text);
            commit(fromText, text);
          }}
          placeholder="DD/MM/YYYY"
          placeholderTextColor={colors.textMuted}
          style={styles.input}
          testID="qa-date-to-input"
          value={toText}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8 },
  field: { flex: 1, gap: 4 },
  label: { ...typography.caption, color: colors.textMuted },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: colors.text,
  },
});
