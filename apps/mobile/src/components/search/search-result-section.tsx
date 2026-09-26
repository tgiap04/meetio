import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { SectionHeading } from '../ui/section-heading';

export interface SearchResultSectionProps {
  title: string;
  children: ReactNode;
  /** e.g. a "Tải thêm" button when the section's query has more pages. */
  footer?: ReactNode;
}

/**
 * One result section on the Search tab ("Transcript (N)" / "Cuộc họp (N)").
 * Generic over its rows: the Transcript section renders `SemanticResultRow`s,
 * the Meeting section renders plain `MeetingListRow`s — this component only
 * owns the heading and the vertical layout, not what kind of row it holds.
 */
export function SearchResultSection({ title, children, footer }: SearchResultSectionProps) {
  return (
    <View style={styles.container}>
      <SectionHeading title={title} />
      <View style={styles.list}>{children}</View>
      {footer}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8 },
  list: { gap: 2 },
});
