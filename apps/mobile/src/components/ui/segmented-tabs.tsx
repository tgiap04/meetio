import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';

export interface SegmentedTabItem {
  key: string;
  label: string;
}

export interface SegmentedTabsProps {
  items: SegmentedTabItem[];
  activeKey: string;
  onChange: (key: string) => void;
}

/** Underline tabs — "Tiếng Việt / Tiếng Anh" on screen-06. */
export function SegmentedTabs({ items, activeKey, onChange }: SegmentedTabsProps) {
  return (
    <View style={styles.row}>
      {items.map((item) => {
        const active = item.key === activeKey;
        return (
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            key={item.key}
            onPress={() => onChange(item.key)}
            style={styles.tab}
          >
            <Text style={[styles.label, active && styles.labelActive]}>{item.label}</Text>
            <View style={[styles.underline, active && styles.underlineActive]} />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
  tab: { flex: 1, alignItems: 'center', paddingBottom: 8, gap: 8 },
  label: { ...typography.body, fontWeight: '600', color: colors.textMuted },
  labelActive: { color: colors.primaryStrong },
  underline: { height: 2, width: '100%', backgroundColor: 'transparent', borderRadius: 1 },
  underlineActive: { backgroundColor: colors.primary },
});
