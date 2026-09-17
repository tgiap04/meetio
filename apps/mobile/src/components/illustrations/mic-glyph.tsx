import { View } from 'react-native';
import { Arc } from './arc';

/**
 * The microphone glyph reused inside `OnboardingArt` (screen 2's big orange
 * button) and `MicPermissionArt` (screen 3's central icon). A capsule body,
 * a downward-facing `Arc` for the holder curve, a thin stand and a foot —
 * every measurement is a ratio of `size` so both call sites can scale it
 * independently.
 */
export interface MicGlyphProps {
  size: number;
  color: string;
  testID?: string;
}

export function MicGlyph({ size, color, testID }: MicGlyphProps) {
  const capsuleWidth = size * 0.36;
  const capsuleHeight = size * 0.5;
  const holderSize = size * 0.66;
  const standHeight = size * 0.14;
  const standWidth = size * 0.06;
  const footWidth = size * 0.4;
  const footHeight = size * 0.06;

  return (
    <View testID={testID} style={{ width: size, height: size, alignItems: 'center' }}>
      <View
        testID={testID ? `${testID}-capsule` : undefined}
        style={{
          width: capsuleWidth,
          height: capsuleHeight,
          borderRadius: capsuleWidth / 2,
          backgroundColor: color,
        }}
      />
      <View style={{ marginTop: -capsuleHeight * 0.28 }}>
        <Arc size={holderSize} arcSpan="half" color={color} thickness={size * 0.05} rotation={135} />
      </View>
      <View
        style={{
          width: standWidth,
          height: standHeight,
          backgroundColor: color,
          marginTop: -standHeight * 0.6,
        }}
      />
      <View
        style={{
          width: footWidth,
          height: footHeight,
          borderRadius: footHeight / 2,
          backgroundColor: color,
        }}
      />
    </View>
  );
}
