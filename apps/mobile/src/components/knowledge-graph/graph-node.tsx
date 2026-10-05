import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import type { EntityType } from '@meetio/shared';
import { getGraphPillPalette } from './entity-colors';
import { PILL_HEIGHT } from './compute-graph-layout';
import { DIMMED_OPACITY, type NodeEmphasis } from './graph-highlight';
import { entityTypeLabel } from '../../utils/entity-type-labels';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';

export interface GraphNodeData {
  readonly id: string;
  readonly label: string;
  readonly type: EntityType;
  readonly mentionCount: number;
}

interface GraphNodeBaseProps {
  node: GraphNodeData;
  /** Node center in canvas points. */
  x: number;
  y: number;
  emphasis: NodeEmphasis;
  onPress: (nodeId: string) => void;
}

export type GraphNodeProps = GraphNodeBaseProps &
  (
    | { variant: 'center'; diameter: number }
    | { variant: 'ring'; maxWidth: number; onWidthMeasured?: (nodeId: string, width: number) => void }
  );

const CENTER_HALO = 8;
/** Pills are a fixed 44pt tall; past this scale the two text lines would clip. */
const MAX_FONT_SCALE = 1.2;

/** "<tên>, <loại>, nhắc <n> lần" — what VoiceOver/TalkBack reads for a node. */
export function buildNodeAccessibilityLabel(node: GraphNodeData): string {
  return `${node.label}, ${entityTypeLabel(node.type)}, nhắc ${node.mentionCount} lần`;
}

/**
 * One knowledge-graph node. `center` is the most-mentioned entity: a brand
 * circle with a soft halo. `ring` is a compact pastel pill sized to content
 * (up to the layout slot's `maxWidth`), with the entity type spelled out so
 * colour is never the only signal.
 */
export function GraphNode(props: GraphNodeProps) {
  const { node, x, y, emphasis, onPress } = props;
  const selected = emphasis === 'selected';
  const opacity = emphasis === 'dimmed' ? DIMMED_OPACITY : 1;
  const a11y = {
    accessibilityRole: 'button' as const,
    accessibilityLabel: buildNodeAccessibilityLabel(node),
    accessibilityState: { selected },
    onPress: () => onPress(node.id),
  };

  if (props.variant === 'center') {
    const { diameter } = props;
    const haloSize = diameter + CENTER_HALO * 2;
    return (
      <View
        pointerEvents="box-none"
        style={[styles.centerWrap, { left: x - haloSize / 2, top: y - haloSize / 2, width: haloSize, height: haloSize, opacity }]}
      >
        <View style={[styles.halo, { borderRadius: haloSize / 2 }, selected && styles.haloSelected]} />
        <Pressable
          {...a11y}
          style={({ pressed }) => [
            styles.center,
            { width: diameter, height: diameter, borderRadius: diameter / 2 },
            pressed && styles.pressed,
          ]}
        >
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} numberOfLines={2} style={styles.centerLabel}>
            {node.label}
          </Text>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} numberOfLines={1} style={styles.centerCaption}>
            {entityTypeLabel(node.type)}
          </Text>
        </Pressable>
      </View>
    );
  }

  const { maxWidth, onWidthMeasured } = props;
  const palette = getGraphPillPalette(node.type);
  return (
    <View
      pointerEvents="box-none"
      style={[styles.ringWrap, { left: x - maxWidth / 2, top: y - PILL_HEIGHT / 2, width: maxWidth, opacity }]}
    >
      <Pressable
        {...a11y}
        onLayout={(event: LayoutChangeEvent) => onWidthMeasured?.(node.id, event.nativeEvent.layout.width)}
        style={({ pressed }) => [
          styles.pill,
          { maxWidth, backgroundColor: palette.fill, borderColor: palette.border },
          selected && styles.pillSelected,
          pressed && styles.pressed,
        ]}
      >
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} numberOfLines={1} style={[styles.pillLabel, { color: palette.text }]}>
          {node.label}
        </Text>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} numberOfLines={1} style={[styles.pillCaption, { color: palette.text }]}>
          {entityTypeLabel(node.type)}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  centerWrap: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  halo: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: colors.primaryTint },
  haloSelected: { backgroundColor: colors.primary },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    // primaryStrong, not primary: white on primary is 2.6:1, on primaryStrong 4.9:1 (AA).
    backgroundColor: colors.primaryStrong,
  },
  centerLabel: { ...typography.label, fontSize: 14, lineHeight: 18, fontWeight: '700', color: colors.primaryText, textAlign: 'center' },
  centerCaption: { ...typography.micro, lineHeight: 14, color: colors.primaryText, marginTop: 2 },
  ringWrap: { position: 'absolute', height: PILL_HEIGHT, alignItems: 'center' },
  pill: {
    height: PILL_HEIGHT,
    minWidth: PILL_HEIGHT,
    borderRadius: PILL_HEIGHT / 2,
    borderWidth: 1,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillSelected: { borderWidth: 2, borderColor: colors.primary },
  pillLabel: { ...typography.caption, fontWeight: '600', lineHeight: 16 },
  pillCaption: { ...typography.micro, lineHeight: 13 },
  pressed: { opacity: 0.8 },
});
