import { StyleSheet, Switch, Text, View } from 'react-native';
import { FilterChipRow, type FilterChip } from './ui/filter-chip-row';
import { ScreenHeader } from './ui/screen-header';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';

const ALL_KEY = 'all';

export interface ActionsListHeaderProps {
  onBack: () => void;
  includeDone: boolean;
  onIncludeDoneChange: (value: boolean) => void;
  assigneeChips: readonly FilterChip[];
  activeAssigneeKey: string;
  onAssigneeChange: (key: string) => void;
  meetingChips: readonly FilterChip[];
  activeMeetingKey: string;
  onMeetingChange: (key: string) => void;
}

export { ALL_KEY as ACTIONS_FILTER_ALL_KEY };

/** Header for the "Việc cần làm" screen (US-34): the done-items toggle, then
 *  assignee and meeting filter chip rows, each always led by "Tất cả". */
export function ActionsListHeader({
  onBack,
  includeDone,
  onIncludeDoneChange,
  assigneeChips,
  activeAssigneeKey,
  onAssigneeChange,
  meetingChips,
  activeMeetingKey,
  onMeetingChange,
}: ActionsListHeaderProps) {
  return (
    <View style={styles.container}>
      <ScreenHeader onBack={onBack} title="Việc cần làm" />
      <View style={styles.body}>
        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>Hiện việc đã xong</Text>
          <Switch onValueChange={onIncludeDoneChange} value={includeDone} />
        </View>
        <FilterChipRow activeKey={activeAssigneeKey} chips={[...assigneeChips]} onChange={onAssigneeChange} />
        {meetingChips.length > 1 ? (
          <FilterChipRow activeKey={activeMeetingKey} chips={[...meetingChips]} onChange={onMeetingChange} />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 12 },
  body: { paddingHorizontal: 16, gap: 12 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  toggleLabel: { ...typography.label, color: colors.text },
});
