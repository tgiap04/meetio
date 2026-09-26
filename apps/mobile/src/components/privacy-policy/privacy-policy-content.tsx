import { StyleSheet, Text, View } from 'react-native';
import { SurfaceCard } from '../ui/surface-card';
import type { PrivacyPolicyBlock, PrivacyPolicyTableRow } from '../../content/privacy-policy';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';

export interface PrivacyPolicyContentProps {
  blocks: readonly PrivacyPolicyBlock[];
}

/**
 * Renders `PRIVACY_POLICY_CONTENT` as simple headings, paragraphs, bullet
 * lists and a per-row readable list for the one table (§3) — no markdown
 * renderer, no table grid. `privacy-policy.test.ts` is what keeps this text
 * itself faithful to `docs/privacy-policy.md`; this component only lays it
 * out.
 */
export function PrivacyPolicyContent({ blocks }: PrivacyPolicyContentProps) {
  return (
    <View style={styles.container}>
      {blocks.map((block, index) => (
        <PrivacyPolicyBlockView block={block} key={index} />
      ))}
    </View>
  );
}

function PrivacyPolicyBlockView({ block }: { block: PrivacyPolicyBlock }) {
  switch (block.type) {
    case 'heading':
      return <Text style={styles.heading}>{block.text}</Text>;
    case 'paragraph':
      return <Text style={styles.paragraph}>{block.text}</Text>;
    case 'bullets':
      return (
        <View style={styles.bulletList}>
          {block.items.map((item, index) => (
            <Text key={index} style={styles.paragraph}>
              {'• '}
              {item.label ? <Text style={styles.bulletLabel}>{item.label}: </Text> : null}
              {item.text}
            </Text>
          ))}
        </View>
      );
    case 'table':
      return (
        <View style={styles.bulletList}>
          <TableRowView row={block.header} />
          {block.rows.map((row, index) => (
            <TableRowView key={index} row={row} />
          ))}
        </View>
      );
    default:
      return null;
  }
}

function TableRowView({ row }: { row: PrivacyPolicyTableRow }) {
  return (
    <SurfaceCard style={styles.tableRow}>
      <Text style={styles.tableRecipient}>{row.recipient}</Text>
      <Text style={styles.paragraph}>{row.data}</Text>
      <Text style={styles.tableCaption}>{row.purpose}</Text>
    </SurfaceCard>
  );
}

const styles = StyleSheet.create({
  container: { gap: 12 },
  heading: { ...typography.sectionTitle, color: colors.text, marginTop: 8 },
  paragraph: { ...typography.body, color: colors.text },
  bulletList: { gap: 8 },
  bulletLabel: { fontWeight: '700' },
  tableRow: { gap: 4 },
  tableRecipient: { ...typography.label, color: colors.text },
  tableCaption: { ...typography.caption, color: colors.textMuted },
});
