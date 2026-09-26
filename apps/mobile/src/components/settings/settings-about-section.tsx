import { StyleSheet } from 'react-native';
import { SectionHeading } from '../ui/section-heading';
import { SettingsRow } from '../ui/settings-row';
import { SurfaceCard } from '../ui/surface-card';
import type { SettingsEntry } from '../../mocks/types';
import { colors } from '../../theme/colors';

export interface SettingsAboutSectionProps {
  entries: readonly SettingsEntry[];
  /** Routes "Chính sách bảo mật" to the full policy screen (Phase 16, NFR-01).
   *  "Điều khoản sử dụng" still has no destination anywhere in the design and
   *  stays inert, per phase-12's key insight #6. */
  onPrivacyPolicyPress: () => void;
}

/** "Về Meetio": privacy policy (real) and terms-of-use (inert) rows. */
export function SettingsAboutSection({ entries, onPrivacyPolicyPress }: SettingsAboutSectionProps) {
  return (
    <SurfaceCard style={styles.card}>
      <SectionHeading title="Về Meetio" />
      {entries.map((entry) => (
        <SettingsRow
          icon="shield"
          key={entry.id}
          label={entry.label}
          onPress={entry.id === 'privacy-policy' ? onPrivacyPolicyPress : undefined}
        />
      ))}
    </SurfaceCard>
  );
}

const styles = StyleSheet.create({
  card: { gap: 8, backgroundColor: colors.surface, borderWidth: 0, padding: 0 },
});
