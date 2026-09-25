import { useState } from 'react';
import { Modal, StyleSheet, Switch, Text, View } from 'react-native';
import { EXPORT_SECTIONS, type ExportSection } from '@meetio/shared';
import { PrimaryButton } from '../primary-button';
import { SecondaryButton } from '../ui/secondary-button';
import { SurfaceCard } from '../ui/surface-card';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';

const SECTION_LABELS: Record<ExportSection, string> = {
  summary: 'Tóm tắt',
  actions: 'Action items',
  transcript: 'Transcript',
  translation: 'Bản dịch',
};

export interface ExportSheetProps {
  visible: boolean;
  onClose: () => void;
  onExport: (format: 'markdown' | 'pdf', sections: readonly ExportSection[]) => void;
  exporting: boolean;
}

/**
 * Section + format picker for US-27. The design has no export surface drawn
 * anywhere, so this is a plain modal sheet rather than a reskin of an
 * existing screen — reached from the meeting-detail kebab menu.
 */
export function ExportSheet({ visible, onClose, onExport, exporting }: ExportSheetProps) {
  const [selected, setSelected] = useState<ReadonlySet<ExportSection>>(new Set(EXPORT_SECTIONS));

  function toggleSection(section: ExportSection, enabled: boolean) {
    setSelected((previous) => {
      const next = new Set(previous);
      if (enabled) {
        next.add(section);
      } else {
        next.delete(section);
      }
      return next;
    });
  }

  const sections = Array.from(selected);
  const hasSelection = sections.length > 0;

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.backdrop}>
        <SurfaceCard style={styles.sheet}>
          <Text style={styles.title}>Xuất cuộc họp</Text>
          {EXPORT_SECTIONS.map((section) => (
            <View key={section} style={styles.row}>
              <Text style={styles.rowLabel}>{SECTION_LABELS[section]}</Text>
              <Switch
                onValueChange={(enabled) => toggleSection(section, enabled)}
                value={selected.has(section)}
              />
            </View>
          ))}
          <PrimaryButton
            disabled={!hasSelection}
            label="Xuất Markdown"
            loading={exporting}
            onPress={() => onExport('markdown', sections)}
          />
          <PrimaryButton
            disabled={!hasSelection}
            label="Xuất PDF"
            loading={exporting}
            onPress={() => onExport('pdf', sections)}
          />
          <SecondaryButton label="Hủy" onPress={onClose} />
        </SurfaceCard>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { gap: 12, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
  title: { ...typography.sectionTitle, color: colors.text },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowLabel: { ...typography.body, color: colors.text },
});
