import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AppIcon, type AppIconName } from '../icons/app-icon';
import { StatusBadge } from '../ui/status-badge';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';

export type ProcessingStepState = 'done' | 'active' | 'pending';

export interface ProcessingStepRowProps {
  label: string;
  state: ProcessingStepState;
  /** Present only for the one row the design gives a destination to — its
   *  presence is what draws the chevron, per the architecture note in the
   *  phase file. */
  onPress?: () => void;
  /** Bottom divider line — every row but the last one draws it. */
  showDivider?: boolean;
}

const DONE_LABEL = 'Hoàn thành';
const PENDING_LABEL = 'Chờ xử lý';

/**
 * One row of the four-stage AI pipeline (Transcript, Embedding, Knowledge
 * Graph, Tóm tắt & Action Items). The crop draws three distinct states, not
 * two, and asymmetrically: `done` and `pending` show plain right-aligned
 * text, while `active` is the only state carrying both the `StatusBadge`
 * pill and a chevron — because it is the only row that navigates.
 */
export function ProcessingStepRow({ label, state, onPress, showDivider = false }: ProcessingStepRowProps) {
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityState={{ disabled: !onPress }}
      disabled={!onPress}
      onPress={onPress}
      style={[styles.row, showDivider && styles.divider]}
    >
      <StepIcon state={state} />
      <Text style={styles.label}>{label}</Text>
      <View style={styles.trailing}>
        {state === 'done' ? <Text style={styles.doneText}>{DONE_LABEL}</Text> : null}
        {state === 'active' ? <StatusBadge status="processing" /> : null}
        {state === 'pending' ? <Text style={styles.pendingText}>{PENDING_LABEL}</Text> : null}
        {onPress ? <AppIcon color={colors.textMuted} name="chevronRight" size={18} /> : null}
      </View>
    </Pressable>
  );
}

function StepIcon({ state }: { state: ProcessingStepState }) {
  if (state === 'pending') {
    return (
      <View style={[styles.iconCircle, styles.iconCirclePending]}>
        <AppIcon color={colors.primary} name="clock" size={14} />
      </View>
    );
  }
  const background = state === 'done' ? colors.success : colors.primary;
  const icon: AppIconName = state === 'done' ? 'check' : 'sparkle';
  return (
    <View style={[styles.iconCircle, { backgroundColor: background }]}>
      <AppIcon color={colors.background} name={icon} size={14} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  iconCircle: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  iconCirclePending: { backgroundColor: colors.background, borderWidth: 1.5, borderColor: colors.primary },
  label: { ...typography.label, color: colors.text, flex: 1 },
  trailing: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  doneText: { ...typography.caption, color: colors.success },
  pendingText: { ...typography.caption, color: colors.textMuted },
});
