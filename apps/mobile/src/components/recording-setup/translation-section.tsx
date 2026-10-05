import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SectionHeading } from '../ui/section-heading';
import { SurfaceCard } from '../ui/surface-card';
import { AudioSourceCard } from './audio-source-card';
import { SecondaryButton } from '../ui/secondary-button';
import type { TranslationPacks } from '../../hooks/use-translation-packs';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';

export const TRANSLATION_ON_DEVICE_NOTE = 'Dịch chạy ngay trên điện thoại — văn bản không gửi đi để dịch.';
export const PACK_DOWNLOAD_LABEL = 'Tải gói dịch ~30 MB';
export const PACK_MISSING_NOTE = 'Cần tải gói ngôn ngữ về máy một lần (~30 MB mỗi ngôn ngữ). Nên dùng Wi-Fi để đỡ tốn data.';
export const PACK_UNAVAILABLE_NOTE = 'Bản cài này chưa hỗ trợ dịch trên máy.';

const OFF = 'off';
const LABELS: Record<string, string> = { 'vi-VN': 'Tiếng Việt', 'en-US': 'Tiếng Anh' };

export interface TranslationSectionProps {
  /** The language being spoken; the offer is the other one of vi-VN / en-US. */
  language: string | null;
  translateTo: string | null;
  onChange: (translateTo: string | null) => void;
  /** Language-pack state; omitted = nothing to prepare (the section just offers the choice). */
  packs?: Pick<TranslationPacks, 'status' | 'error' | 'download'>;
}

/**
 * Setup screen 05, "Dịch sang": off by default. Translation runs on the phone (Phase 21), so turning it
 * on needs the two language packs: this section shows whether they are there and offers the download
 * (with progress state and a retry); the screen keeps Start disabled until they are.
 */
export function TranslationSection({ language, translateTo, onChange, packs }: TranslationSectionProps) {
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
        <SurfaceCard style={styles.card} testID="translation-on-device-note">
          <Text style={styles.note}>{TRANSLATION_ON_DEVICE_NOTE}</Text>
        </SurfaceCard>
      ) : null}
      {translateTo && packs ? <PackStatus packs={packs} /> : null}
    </>
  );
}

function PackStatus({ packs }: { packs: NonNullable<TranslationSectionProps['packs']> }) {
  const { status, error, download } = packs;
  if (status === 'off') return null;
  return (
    <SurfaceCard style={[styles.card, styles.packs]} testID="translation-packs">
      {status === 'checking' || status === 'downloading' ? (
        <View style={styles.row}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.note}>{status === 'checking' ? 'Đang kiểm tra gói dịch…' : 'Đang tải gói dịch… Vui lòng giữ màn hình này.'}</Text>
        </View>
      ) : null}
      {status === 'ready' ? <Text style={styles.note}>Gói dịch đã sẵn sàng.</Text> : null}
      {status === 'unavailable' ? <Text style={styles.warning}>{PACK_UNAVAILABLE_NOTE}</Text> : null}
      {status === 'missing' ? (
        <>
          <Text style={styles.note}>{PACK_MISSING_NOTE}</Text>
          <SecondaryButton label={PACK_DOWNLOAD_LABEL} onPress={download} />
        </>
      ) : null}
      {status === 'error' ? (
        <>
          <Text style={styles.warning}>{error}</Text>
          {/* download() with nothing missing just re-checks, so it retries a failed check as well. */}
          <SecondaryButton label="Thử lại" onPress={download} />
        </>
      ) : null}
    </SurfaceCard>
  );
}

const styles = StyleSheet.create({
  packs: { gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  warning: { ...typography.caption, color: colors.warning },
  card: { padding: 16 },
  note: { ...typography.body, color: colors.text },
});
