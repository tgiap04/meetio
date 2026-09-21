import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppIcon, type AppIconName } from '../icons/app-icon';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';

/**
 * One tab's presentation state — plain data, not a react-navigation type.
 * `app/(app)/(tabs)/_layout.tsx` adapts `Tabs`' `tabBar` render prop
 * (`state`/`descriptors`/`navigation`) into a list of these, so this
 * component stays a pure `props in → elements out` primitive per the
 * phase's data-flow rule: no router import, no navigation type, just an
 * `onPress` callback.
 */
export interface TabBarItem {
  key: string;
  label: string;
  icon: AppIconName;
  focused: boolean;
  onPress: () => void;
}

export interface BottomTabBarProps {
  items: TabBarItem[];
}

/** The four-tab bar (screen-04 / screen-14): active tab in `primaryStrong`, rest muted. */
export function BottomTabBar({ items }: BottomTabBarProps) {
  // The home indicator sits below the bar on a gesture-nav device. Without
  // this the labels are drawn under it — legible, but sitting in the swipe
  // area, so a tap near the bottom of the bar is as likely to close the app.
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.bar, { paddingBottom: styles.bar.paddingBottom + insets.bottom }]}>
      {items.map((item) => (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: item.focused }}
          key={item.key}
          onPress={item.onPress}
          style={styles.item}
        >
          <AppIcon
            color={item.focused ? colors.primaryStrong : colors.textMuted}
            name={item.icon}
            size={22}
          />
          <Text style={[styles.label, item.focused && styles.labelFocused]}>{item.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 8,
    paddingBottom: 8,
  },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 },
  label: { ...typography.caption, fontSize: 11, color: colors.textMuted },
  labelFocused: { color: colors.primaryStrong, fontWeight: '600' },
});
