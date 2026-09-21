import { Fragment } from 'react';
import { StyleSheet, View } from 'react-native';
import { RadioRow } from './radio-row';
import { SurfaceCard } from '../ui/surface-card';
import { colors } from '../../theme/colors';
import type { RecordingOption } from '../../mocks/types';

export interface AudioSourceCardProps {
  options: readonly RecordingOption[];
  selectedId: string;
  onSelect: (id: string) => void;
}

/** "Nguồn âm thanh" card — one `RadioRow` per option, one inset divider between rows. */
export function AudioSourceCard({ options, selectedId, onSelect }: AudioSourceCardProps) {
  return (
    <SurfaceCard style={styles.card}>
      {options.map((option, index) => (
        <Fragment key={option.id}>
          {index > 0 ? <View style={styles.divider} /> : null}
          <RadioRow
            description={option.description}
            label={option.label}
            onPress={() => onSelect(option.id)}
            selected={option.id === selectedId}
          />
        </Fragment>
      ))}
    </SurfaceCard>
  );
}

const styles = StyleSheet.create({
  card: { paddingVertical: 0 },
  divider: { height: 1, backgroundColor: colors.border, marginLeft: 36 },
});
