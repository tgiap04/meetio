import { Fragment } from 'react';
import { StyleSheet, View } from 'react-native';
import { RadioRow } from './radio-row';
import { SurfaceCard } from '../ui/surface-card';
import { colors } from '../../theme/colors';
import type { RecordingOption } from '../../content/recording-options';

export interface AudioSourceCardProps<T extends string> {
  options: readonly RecordingOption<T>[];
  selectedId: T | null;
  onSelect: (id: T) => void;
}

/** A radio card — one `RadioRow` per option, one inset divider between rows. Used for the audio
 *  source (design "Nguồn âm thanh" card), and in the same style for language and quality. */
export function AudioSourceCard<T extends string>({ options, selectedId, onSelect }: AudioSourceCardProps<T>) {
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
