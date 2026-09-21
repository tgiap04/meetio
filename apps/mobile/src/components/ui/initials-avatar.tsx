import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../../theme/colors';

export interface InitialsAvatarProps {
  /** 1-2 letters, e.g. "NA" for Nguyễn Văn Anh (screen-14). */
  initials: string;
  size?: number;
  /** Draws a padded ring around the circle — e.g. the active speaker in a live transcript. */
  haloColor?: string;
}

/** Solid-fill circle with initials — used wherever the design has no photo to show. */
export function InitialsAvatar({ initials, size = 40, haloColor }: InitialsAvatarProps) {
  const haloSize = size + 8;

  const circle = (
    <View
      style={[
        styles.circle,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
    >
      <Text style={[styles.label, { fontSize: size * 0.4 }]}>{initials.slice(0, 2).toUpperCase()}</Text>
    </View>
  );

  if (!haloColor) {
    return circle;
  }

  return (
    <View
      style={[
        styles.halo,
        { width: haloSize, height: haloSize, borderRadius: haloSize / 2, borderColor: haloColor },
      ]}
    >
      {circle}
    </View>
  );
}

const styles = StyleSheet.create({
  circle: { backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  halo: { borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  label: { color: colors.primaryText, fontWeight: '700' },
});
