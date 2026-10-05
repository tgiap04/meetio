import { StyleSheet, Text } from 'react-native';
import { SurfaceCard } from '../ui/surface-card';
import { SecondaryButton } from '../ui/secondary-button';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';

export const RECOGNITION_CHECK_FAILED_MESSAGE = 'Không kiểm tra được khả năng nhận diện của máy — thử lại';

/**
 * The phone would not say whether it can recognise speech on-device. Guessing "no" would send the
 * user's audio to the server (NFR-02), so setup stops here until the check succeeds.
 */
export function RecognitionCheckFailed({ onRetry }: { onRetry(): void }) {
  return (
    <SurfaceCard style={styles.card} testID="recognition-check-failed">
      <Text style={styles.body}>{RECOGNITION_CHECK_FAILED_MESSAGE}</Text>
      <SecondaryButton label="Thử lại" onPress={onRetry} />
    </SurfaceCard>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12, padding: 16 },
  body: { ...typography.body, color: colors.text },
});
