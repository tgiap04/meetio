import { StyleSheet, Text, View } from 'react-native';
import { AppIcon } from '../icons/app-icon';
import { StatusBadge } from '../ui/status-badge';
import { SurfaceCard } from '../ui/surface-card';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import type { Meeting } from '../../mocks/types';

export interface MeetingHeroProps {
  meeting: Meeting;
}

/**
 * The card at the top of screen-08: calendar tile, title, "DD/MM/YYYY · N
 * phút" meta line, and the status badge — transcribed from
 * `design/screen-08-tong-quan-cuoc-hop.png`.
 */
export function MeetingHero({ meeting }: MeetingHeroProps) {
  return (
    <SurfaceCard style={styles.card}>
      <View style={styles.tile}>
        <AppIcon color={colors.text} name="calendar" size={24} />
      </View>
      <View style={styles.body}>
        <Text numberOfLines={1} style={styles.title}>
          {meeting.title}
        </Text>
        <Text style={styles.meta}>
          {meeting.date} · {meeting.durationMinutes} phút
        </Text>
      </View>
      <StatusBadge status={meeting.status} />
    </SurfaceCard>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  tile: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, gap: 2 },
  title: { ...typography.sectionTitle, color: colors.text },
  meta: { ...typography.caption, color: colors.textMuted },
});
