import { StyleSheet, Text, View } from 'react-native';
import type { Point } from './compute-edge-geometry';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';

export interface GraphEdgeLabelProps {
  label: string;
  /** Midpoint of the visible (trimmed) segment. */
  at: Point;
  /** The selected node's edge — label picks up the brand text colour. */
  active: boolean;
}

export const EDGE_LABEL_MAX_WIDTH = 90;
const LABEL_HEIGHT = 20;

/** Small unrotated relation chip on an edge's midpoint — horizontal so it
 *  stays readable at any edge angle. Purely visual; the relation list below
 *  the canvas carries the same text for screen readers. */
export function GraphEdgeLabel({ label, at, active }: GraphEdgeLabelProps) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={[styles.wrap, { left: at.x - EDGE_LABEL_MAX_WIDTH / 2, top: at.y - LABEL_HEIGHT / 2 }]}
    >
      <View style={[styles.chip, active && styles.chipActive]}>
        <Text maxFontSizeMultiplier={1.2} numberOfLines={1} style={[styles.text, active && styles.textActive]}>
          {label}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', width: EDGE_LABEL_MAX_WIDTH, height: LABEL_HEIGHT, alignItems: 'center' },
  chip: {
    maxWidth: EDGE_LABEL_MAX_WIDTH,
    height: LABEL_HEIGHT,
    justifyContent: 'center',
    paddingHorizontal: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipActive: { borderColor: colors.primary },
  text: { ...typography.micro, lineHeight: 14, color: colors.textMuted },
  textActive: { color: colors.primaryStrong },
});
