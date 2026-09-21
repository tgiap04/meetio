import { StyleSheet, View } from 'react-native';
import { ActionItemCard } from './action-item-card';
import { SectionHeading } from '../ui/section-heading';
import type { ActionItem } from '../../mocks/types';

export interface ActionItemsSectionProps {
  items: readonly ActionItem[];
  checkedIds: ReadonlySet<string>;
  onToggle: (id: string) => void;
}

/** "Action Items" heading + the list of toggleable cards. Shown on both the
 *  Tóm tắt tab (alongside the summary) and the Action Items tab (alone). */
export function ActionItemsSection({ items, checkedIds, onToggle }: ActionItemsSectionProps) {
  return (
    <View style={styles.container}>
      <SectionHeading title="Action Items" />
      <View style={styles.list}>
        {items.map((item) => (
          <ActionItemCard checked={checkedIds.has(item.id)} item={item} key={item.id} onToggle={onToggle} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 12 },
  list: { gap: 12 },
});
