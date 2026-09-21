import type { ComponentProps } from 'react';
import { Tabs } from 'expo-router';
import { BottomTabBar, type TabBarItem } from '../../../src/components/ui/bottom-tab-bar';
import type { AppIconName } from '../../../src/components/icons/app-icon';

type TabBarRenderProp = NonNullable<ComponentProps<typeof Tabs>['tabBar']>;

/** route name (as registered below) -> tab bar presentation. */
const TAB_ICON: Record<string, AppIconName> = {
  index: 'home',
  library: 'library',
  search: 'search',
  settings: 'settings',
};
const TAB_LABEL: Record<string, string> = {
  index: 'Trang chủ',
  library: 'Thư viện',
  search: 'Tìm kiếm',
  settings: 'Cài đặt',
};

/**
 * Adapts `Tabs`' `tabBar` render prop (react-navigation's `state` /
 * `descriptors` / `navigation`) into the plain `TabBarItem[]` the pure
 * `BottomTabBar` primitive takes. This function is the ONLY place that talks
 * to react-navigation's tab types — the primitive itself stays untyped
 * against them, per the phase's "primitives take primitive props only" rule.
 */
const renderTabBar: TabBarRenderProp = ({ state, navigation }) => {
  const items: TabBarItem[] = state.routes.map((route, index) => ({
    key: route.key,
    label: TAB_LABEL[route.name] ?? route.name,
    icon: TAB_ICON[route.name] ?? 'home',
    focused: state.index === index,
    onPress: () => {
      const isFocused = state.index === index;
      const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
      if (!isFocused && !event.defaultPrevented) {
        navigation.navigate(route.name);
      }
    },
  }));
  return <BottomTabBar items={items} />;
};

/**
 * The four-tab shell (screen-04 / screen-14): Trang chủ, Thư viện, Tìm kiếm,
 * Cài đặt. Nested inside `(app)/_layout.tsx` — which still owns the auth
 * guard and renders exactly one `Stack` — so every stacked screen
 * (`permission`, `consent`, and every recording/meeting screen phases 04–09
 * add) stays a sibling of `(tabs)` and renders without the tab bar.
 *
 * `tabBar` is a custom render rather than `screenOptions` styling: the design
 * colors only the active icon+label orange and leaves the rest a flat cream
 * bar with no visible top border, which default `Tabs` styling cannot
 * reliably reproduce across iOS/Android without fighting platform defaults.
 */
export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }} tabBar={renderTabBar}>
      <Tabs.Screen name="index" options={{ title: TAB_LABEL.index }} />
      <Tabs.Screen name="library" options={{ title: TAB_LABEL.library }} />
      <Tabs.Screen name="search" options={{ title: TAB_LABEL.search }} />
      <Tabs.Screen name="settings" options={{ title: TAB_LABEL.settings }} />
    </Tabs>
  );
}
