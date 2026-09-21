import { StyleSheet } from 'react-native';
import { SectionHeading } from '../ui/section-heading';
import { SettingsRow } from '../ui/settings-row';
import { SurfaceCard } from '../ui/surface-card';
import type { SettingsEntry } from '../../mocks/types';
import { colors } from '../../theme/colors';

export interface SettingsAboutSectionProps {
  entries: readonly SettingsEntry[];
}

/**
 * "Về Meetio": privacy policy and terms-of-use rows. Neither has a
 * destination anywhere in the design (no sub-screen sheet exists for
 * either) — both render, both are deliberately inert, per phase-12's
 * key insight #6.
 */
export function SettingsAboutSection({ entries }: SettingsAboutSectionProps) {
  return (
    <SurfaceCard style={styles.card}>
      <SectionHeading title="Về Meetio" />
      {entries.map((entry) => (
        <SettingsRow icon="shield" key={entry.id} label={entry.label} />
      ))}
    </SurfaceCard>
  );
}

const styles = StyleSheet.create({
  card: { gap: 8, backgroundColor: colors.surface, borderWidth: 0, padding: 0 },
});
