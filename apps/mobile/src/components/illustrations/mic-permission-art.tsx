import { View } from 'react-native';
import { BrandFill } from './brand-fill';
import { colors } from '../../theme/colors';
import { Arc } from './arc';
import { MicGlyph } from './mic-glyph';

/**
 * Screen 3's hero illustration: concentric peach rings behind a large orange
 * circle holding a white `MicGlyph`, two sound-wave arcs on each side, and a
 * white card with a checkmark plus two text-line placeholders underneath
 * (design.png, "3. Quyền truy cập").
 */
export interface MicPermissionArtProps {
  size: number;
  testID?: string;
}

function SoundWaves({ size, side, testID }: { size: number; side: 'left' | 'right'; testID?: string }) {
  const rotation = side === 'left' ? 90 : 270;
  return (
    <View testID={testID} style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Arc size={size} arcSpan="half" color={colors.primary} thickness={size * 0.07} rotation={rotation} />
      <View style={{ position: 'absolute' }}>
        <Arc size={size * 0.55} arcSpan="half" color={colors.primary} thickness={size * 0.09} rotation={rotation} />
      </View>
    </View>
  );
}

export function MicPermissionArt({ size, testID }: MicPermissionArtProps) {
  const circleSize = size * 0.42;
  const waveSize = size * 0.24;
  const cardWidth = size * 0.66;
  const cardHeight = size * 0.22;
  const tickSize = size * 0.09;

  return (
    <View testID={testID} style={{ width: size, alignItems: 'center' }}>
      <View style={{ height: size * 0.62, alignItems: 'center', justifyContent: 'center' }}>
        <View
          testID={testID ? `${testID}-ring-outer` : undefined}
          style={{ position: 'absolute' }}
        >
          <Arc size={size * 0.62} arcSpan="full" color={colors.primaryTint} thickness={size * 0.03} />
        </View>
        <View
          testID={testID ? `${testID}-ring-inner` : undefined}
          style={{ position: 'absolute' }}
        >
          <Arc size={size * 0.5} arcSpan="full" color={colors.primaryTint} thickness={size * 0.035} />
        </View>

        <View
          style={{
            position: 'absolute',
            left: 0,
            flexDirection: 'row',
          }}
        >
          <SoundWaves size={waveSize} side="left" testID={testID ? `${testID}-waves-left` : undefined} />
        </View>
        <View
          style={{
            position: 'absolute',
            right: 0,
            flexDirection: 'row',
          }}
        >
          <SoundWaves size={waveSize} side="right" testID={testID ? `${testID}-waves-right` : undefined} />
        </View>

        <BrandFill
          testID={testID ? `${testID}-circle` : undefined}
          style={{
            width: circleSize,
            height: circleSize,
            borderRadius: circleSize / 2,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <MicGlyph size={circleSize * 0.6} color={colors.primaryText} />
        </BrandFill>
      </View>

      <View
        testID={testID ? `${testID}-card` : undefined}
        style={{
          width: cardWidth,
          height: cardHeight,
          borderRadius: 12,
          backgroundColor: colors.background,
          borderWidth: 1,
          borderColor: colors.border,
          alignItems: 'center',
          justifyContent: 'center',
          padding: 10,
          gap: 6,
        }}
      >
        <View
          testID={testID ? `${testID}-tick` : undefined}
          style={{
            width: tickSize,
            height: tickSize,
            borderRadius: tickSize / 2,
            backgroundColor: colors.success,
          }}
        />
        <View style={{ width: '70%', height: 5, borderRadius: 3, backgroundColor: colors.border }} />
        <View style={{ width: '45%', height: 5, borderRadius: 3, backgroundColor: colors.border }} />
      </View>
    </View>
  );
}
