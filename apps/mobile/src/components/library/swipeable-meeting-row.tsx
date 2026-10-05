import { useRef, type MutableRefObject } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';
import { AppIcon } from '../icons/app-icon';
import { MeetingListRow, type MeetingListRowProps } from '../ui/meeting-list-row';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';

export interface SwipeableMeetingRowProps {
  row: MeetingListRowProps;
  /** Called when the revealed "Xóa" action is tapped (the screen shows its confirm Alert). */
  onDeleteRequest: () => void;
  /** Called when the revealed "Đổi tên" action is tapped (the screen opens the rename dialog). */
  onRenameRequest: () => void;
  /** Shared by every row in the list so at most one stays open at a time. */
  openRowRef: MutableRefObject<SwipeableMethods | null>;
}

/** A library `MeetingListRow` that reveals "Đổi tên" (neutral) and "Xóa" (red) actions on swipe-left (US-26). */
export function SwipeableMeetingRow({ row, onDeleteRequest, onRenameRequest, openRowRef }: SwipeableMeetingRowProps) {
  const swipeableRef = useRef<SwipeableMethods>(null);

  function handleWillOpen() {
    const previous = openRowRef.current;
    if (previous && previous !== swipeableRef.current) {
      previous.close();
    }
    openRowRef.current = swipeableRef.current;
  }

  function handleClose() {
    if (openRowRef.current === swipeableRef.current) {
      openRowRef.current = null;
    }
  }

  function handleDeletePress() {
    swipeableRef.current?.close();
    onDeleteRequest();
  }

  function handleRenamePress() {
    swipeableRef.current?.close();
    onRenameRequest();
  }

  return (
    <ReanimatedSwipeable
      friction={2}
      onSwipeableClose={handleClose}
      onSwipeableWillOpen={handleWillOpen}
      overshootRight={false}
      ref={swipeableRef}
      renderRightActions={() => (
        <View style={styles.actions}>
          <Pressable
            accessibilityLabel={`Đổi tên cuộc họp ${row.title}`}
            accessibilityRole="button"
            onPress={handleRenamePress}
            style={[styles.action, styles.renameAction]}
          >
            <AppIcon color={colors.text} name="edit" size={18} />
            <Text style={[styles.actionText, styles.renameText]}>Đổi tên</Text>
          </Pressable>
          <Pressable
            accessibilityLabel={`Xóa cuộc họp ${row.title}`}
            accessibilityRole="button"
            onPress={handleDeletePress}
            style={[styles.action, styles.deleteAction]}
          >
            <Text style={styles.actionText}>Xóa</Text>
          </Pressable>
        </View>
      )}
      rightThreshold={40}
    >
      <MeetingListRow {...row} />
    </ReanimatedSwipeable>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row' },
  action: { width: 88, alignItems: 'center', justifyContent: 'center', gap: 4 },
  renameAction: { backgroundColor: colors.border },
  deleteAction: { backgroundColor: colors.danger },
  actionText: { ...typography.label, color: '#FFFFFF' },
  renameText: { color: colors.text },
});
