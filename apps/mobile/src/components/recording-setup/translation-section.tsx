import { StyleSheet, Text } from 'react-native';
import { SectionHeading } from '../ui/section-heading';
import { SurfaceCard } from '../ui/surface-card';
import { AudioSourceCard } from './audio-source-card';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';

export const TRANSLATION_COST_NOTE = 'Dịch dùng thêm AI cho mỗi câu — tốn chi phí hơn.';

const OFF = 'off';
const LABELS: Record<string, string> = { 'vi-VN': 'Tiếng Việt', 'en-US': 'Tiếng Anh' };

export interface TranslationSectionProps {
  /** The language being spoken; the offer is the other one of vi-VN / en-US. */
  language: string | null;
  translateTo: string | null;
  onChange: (translateTo: string | null) => void;
}

/**
 * Setup screen 05, "Dịch sang" (Phase 09): off by default; turning it on says up front that it costs
 * more, because every sentence is an extra AI call.
 */
export function TranslationSection({ language, translateTo, onChange }: TranslationSectionProps) {
  if (!language) return null;
  const other = language === 'vi-VN' ? 'en-US' : 'vi-VN';
  return (
    <>
      <SectionHeading title="Dịch sang" />
      <AudioSourceCard
        onSelect={(id) => onChange(id === OFF ? null : id)}
        options={[
          { id: OFF, label: 'Không dịch' },
          { id: other, label: LABELS[other] },
        ]}
        selectedId={translateTo ?? OFF}
      />
      {translateTo ? (
        <SurfaceCard style={styles.card} testID="translation-cost-note">
          <Text style={styles.note}>{TRANSLATION_COST_NOTE}</Text>
        </SurfaceCard>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  card: { padding: 16 },
  note: { ...typography.body, color: colors.text },
});
