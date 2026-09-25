import { useEffect, useState } from 'react';
import { Alert, Modal, StyleSheet, Text, View } from 'react-native';
import { PrimaryButton } from '../primary-button';
import { SecondaryButton } from '../ui/secondary-button';
import { SurfaceCard } from '../ui/surface-card';
import { TextField } from '../text-field';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';

export interface DateRangeFilter {
  /** ISO 8601, or `null` when that bound is unset. Bounds `created_at`. */
  from: string | null;
  to: string | null;
}

export interface LibraryDateFilterSheetProps {
  visible: boolean;
  initialRange: DateRangeFilter;
  onApply: (range: DateRangeFilter) => void;
  onClose: () => void;
}

const DATE_FORMAT_PATTERN = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const DATE_PLACEHOLDER = 'DD/MM/YYYY';

const PRESETS = [
  { label: '7 ngày qua', days: 7 },
  { label: '30 ngày qua', days: 30 },
  { label: '90 ngày qua', days: 90 },
];

function toDdMmYyyy(date: Date): string {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${date.getFullYear()}`;
}

function parseDdMmYyyy(value: string): Date | null {
  const match = DATE_FORMAT_PATTERN.exec(value.trim());
  if (!match) {
    return null;
  }
  const [, dd, mm, yyyy] = match;
  const date = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
  const isRealDate =
    date.getFullYear() === Number(yyyy) && date.getMonth() === Number(mm) - 1 && date.getDate() === Number(dd);
  return isRealDate ? date : null;
}

function startOfDayIso(date: Date): string {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy.toISOString();
}

function endOfDayIso(date: Date): string {
  const copy = new Date(date);
  copy.setHours(23, 59, 59, 999);
  return copy.toISOString();
}

/**
 * US-21's date-range filter, combinable with search/status. No native
 * date-picker dependency: presets cover the common cases, and the two text
 * fields are a simple `DD/MM/YYYY` custom range rather than pulling in a
 * calendar widget for something this small.
 */
export function LibraryDateFilterSheet({ visible, initialRange, onApply, onClose }: LibraryDateFilterSheetProps) {
  const [fromText, setFromText] = useState('');
  const [toText, setToText] = useState('');

  useEffect(() => {
    if (visible) {
      setFromText(initialRange.from ? toDdMmYyyy(new Date(initialRange.from)) : '');
      setToText(initialRange.to ? toDdMmYyyy(new Date(initialRange.to)) : '');
    }
  }, [visible, initialRange.from, initialRange.to]);

  function applyPreset(days: number) {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - days + 1);
    setFromText(toDdMmYyyy(from));
    setToText(toDdMmYyyy(to));
  }

  function handleApply() {
    const fromDate = fromText.trim() === '' ? null : parseDdMmYyyy(fromText);
    const toDate = toText.trim() === '' ? null : parseDdMmYyyy(toText);
    const fromInvalid = fromText.trim() !== '' && !fromDate;
    const toInvalid = toText.trim() !== '' && !toDate;
    if (fromInvalid || toInvalid) {
      Alert.alert('Ngày không hợp lệ', `Vui lòng nhập theo định dạng ${DATE_PLACEHOLDER}.`);
      return;
    }
    onApply({
      from: fromDate ? startOfDayIso(fromDate) : null,
      to: toDate ? endOfDayIso(toDate) : null,
    });
  }

  function handleClear() {
    setFromText('');
    setToText('');
    onApply({ from: null, to: null });
  }

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.backdrop}>
        <SurfaceCard style={styles.sheet}>
          <Text style={styles.title}>Lọc theo thời gian</Text>
          <View style={styles.presetRow}>
            {PRESETS.map((preset) => (
              <SecondaryButton key={preset.label} label={preset.label} onPress={() => applyPreset(preset.days)} />
            ))}
          </View>
          <TextField
            label={`Từ ngày (${DATE_PLACEHOLDER})`}
            onChangeText={setFromText}
            placeholder={DATE_PLACEHOLDER}
            value={fromText}
          />
          <TextField
            label={`Đến ngày (${DATE_PLACEHOLDER})`}
            onChangeText={setToText}
            placeholder={DATE_PLACEHOLDER}
            value={toText}
          />
          <PrimaryButton label="Áp dụng" onPress={handleApply} />
          <SecondaryButton label="Xóa bộ lọc" onPress={handleClear} />
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
  presetRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
});
