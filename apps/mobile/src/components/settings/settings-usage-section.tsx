import { StyleSheet, Text, View } from 'react-native';
import type { TokenUsage } from '@meetio/shared';
import { SectionHeading } from '../ui/section-heading';
import { SurfaceCard } from '../ui/surface-card';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';

export interface SettingsUsageSectionProps {
  usage: TokenUsage;
}

/**
 * This month's AI usage (NFR-07). A user with no budget set (`budget: null`,
 * the default per OQ-04 — no default cap, only users given a
 * `monthly_token_budget` are limited) sees only a plain usage count; a user
 * with a budget also sees the fraction and a visible warning once `warning`
 * is true (≥ 80%, per `QuotaGuard`).
 */
export function SettingsUsageSection({ usage }: SettingsUsageSectionProps) {
  const hasBudget = usage.budget !== null;

  return (
    <View style={styles.container}>
      <SectionHeading title="Sử dụng AI tháng này" />
      <SurfaceCard style={styles.card}>
        <Text style={styles.usageText}>
          {hasBudget
            ? `Đã dùng ${usage.used} / ${usage.budget} token (${usage.percent}%)`
            : `Đã dùng ${usage.used} token tháng này`}
        </Text>
        {usage.warning ? (
          <Text style={styles.warning}>
            Bạn đã dùng gần hết hạn mức token AI tháng này. Một số tính năng AI có thể bị chặn nếu
            vượt hạn mức.
          </Text>
        ) : null}
      </SurfaceCard>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 12 },
  card: { gap: 8 },
  usageText: { ...typography.body, color: colors.text },
  warning: { ...typography.caption, color: colors.warning },
});
