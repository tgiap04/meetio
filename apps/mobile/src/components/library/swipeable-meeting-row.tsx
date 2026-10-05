import { useRef, type MutableRefObject } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';
import { MeetingListRow, type MeetingListRowProps } from '../ui/meeting-list-row';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';

export interface SwipeableMeetingRowProps {
  row: MeetingListRowProps;
  /** Called when the revealed "Xóa" action is tapped (the screen shows its confirm Alert). */
  onDeleteRequest: () => void;
  /** Shared by every row in the list so at most one stays open at a time. */
  openRowRef: MutableRefObject<SwipeableMethods | null>;
}

/** A library `MeetingListRow` that reveals a red "Xóa" action on swipe-left (US-26). */
export function SwipeableMeetingRow({ row, onDeleteRequest, openRowRef }: SwipeableMeetingRowProps) {
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

  return (
    <ReanimatedSwipeable
      friction={2}
      onSwipeableClose={handleClose}
      onSwipeableWillOpen={handleWillOpen}
      overshootRight={false}
      ref={swipeableRef}
      renderRightActions={() => (
        <Pressable
          accessibilityLabel={`Xóa cuộc họp ${row.title}`}
          accessibilityRole="button"
          onPress={handleDeletePress}
          style={styles.action}
        >
          <Text style={styles.actionText}>Xóa</Text>
        </Pressable>
      )}
      rightThreshold={40}
    >
      <MeetingListRow {...row} />
    </ReanimatedSwipeable>
  );
}

const styles = StyleSheet.create({
  action: {
    width: 88,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.danger,
  },
  actionText: { ...typography.label, color: '#FFFFFF' },
});
