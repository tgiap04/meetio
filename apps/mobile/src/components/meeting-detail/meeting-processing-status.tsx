import { ActivityIndicator, StyleSheet, Text } from 'react-native';
import { MeetingStatus, type MeetingProcessingStep } from '@meetio/shared';
import { PrimaryButton } from '../primary-button';
import { SurfaceCard } from '../ui/surface-card';
import { currentProcessingStep, PROCESSING_STEP_LABELS } from '../../utils/processing-step-labels';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';

export interface MeetingProcessingStatusProps {
  status: MeetingStatus;
  processingSteps: readonly MeetingProcessingStep[];
  failureReason: string | null;
  onRetry: () => void;
  retryLoading: boolean;
}

const DEFAULT_FAILURE_MESSAGE = 'Xử lý thất bại. Vui lòng thử lại.';

/**
 * Screen 08's realtime pipeline banner (US-28): the current step while
 * `queued`/`processing`, or the failure reason with a retry action once
 * `failed` (US-29's `scope: 'changed'` resume-from-failure). Renders nothing
 * for `ready` — the summary/action-items sections take over at that point —
 * and nothing for the pre-pipeline statuses (`recording`/`paused`/`ended`),
 * which this screen never shows a "just recorded" meeting in anyway.
 */
export function MeetingProcessingStatus({
  status,
  processingSteps,
  failureReason,
  onRetry,
  retryLoading,
}: MeetingProcessingStatusProps) {
  if (status === MeetingStatus.FAILED) {
    return (
      <SurfaceCard style={styles.card} testID="meeting-processing-failed">
        <Text style={styles.failureText}>{failureReason ?? DEFAULT_FAILURE_MESSAGE}</Text>
        <PrimaryButton label="Thử lại" loading={retryLoading} onPress={onRetry} />
      </SurfaceCard>
    );
  }

  if (status === MeetingStatus.QUEUED || status === MeetingStatus.PROCESSING) {
    const step = currentProcessingStep(processingSteps);
    return (
      <SurfaceCard style={[styles.card, styles.row]} testID="meeting-processing-active">
        <ActivityIndicator color={colors.primary} />
        <Text style={styles.stepText}>
          {step ? PROCESSING_STEP_LABELS[step] : 'Đang xử lý…'}
        </Text>
      </SurfaceCard>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  card: { gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  failureText: { ...typography.body, color: colors.danger },
  stepText: { ...typography.body, color: colors.text },
});
