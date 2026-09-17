import { View } from 'react-native';
import { BrandFill } from './brand-fill';
import { colors } from '../../theme/colors';
import { MicGlyph } from './mic-glyph';

/**
 * Screen 2's hero illustration: a phone frame holding a large round orange
 * mic button, two floating white cards with grey text-line placeholders, and
 * four small badges around the border (design.png, "2. Onboarding").
 */
export interface OnboardingArtProps {
  size: number;
  testID?: string;
}

function TextLines({ testID }: { testID?: string }) {
  return (
    <View testID={testID} style={{ gap: 4 }}>
      <View style={{ width: '80%', height: 5, borderRadius: 3, backgroundColor: colors.border }} />
      <View style={{ width: '55%', height: 5, borderRadius: 3, backgroundColor: colors.border }} />
    </View>
  );
}

function Badge({ size, style }: { size: number; style: { top?: number; bottom?: number; left?: number; right?: number } }) {
  return (
    <View
      style={[
        {
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: colors.background,
          borderWidth: 1,
          borderColor: colors.border,
        },
        style,
      ]}
    />
  );
}

export function OnboardingArt({ size, testID }: OnboardingArtProps) {
  const frameWidth = size * 0.56;
  const frameHeight = size * 0.86;
  const buttonSize = size * 0.32;
  const cardWidth = size * 0.4;
  const cardHeight = size * 0.16;
  const badgeSize = size * 0.09;

  return (
    <View testID={testID} style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View
        style={{
          width: frameWidth,
          height: frameHeight,
          borderRadius: frameWidth * 0.18,
          borderWidth: 2,
          borderColor: colors.border,
          backgroundColor: colors.background,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <BrandFill
          testID={testID ? `${testID}-mic-button` : undefined}
          style={{
            width: buttonSize,
            height: buttonSize,
            borderRadius: buttonSize / 2,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <MicGlyph size={buttonSize * 0.55} color={colors.primaryText} />
        </BrandFill>
      </View>

      <View
        testID={testID ? `${testID}-card-top` : undefined}
        style={{
          position: 'absolute',
          top: size * 0.06,
          left: size * 0.02,
          width: cardWidth,
          height: cardHeight,
          borderRadius: 10,
          backgroundColor: colors.background,
          padding: 8,
          justifyContent: 'center',
        }}
      >
        <TextLines />
      </View>

      <View
        testID={testID ? `${testID}-card-bottom` : undefined}
        style={{
          position: 'absolute',
          bottom: size * 0.08,
          right: size * 0.0,
          width: cardWidth,
          height: cardHeight,
          borderRadius: 10,
          backgroundColor: colors.background,
          padding: 8,
          justifyContent: 'center',
        }}
      >
        <TextLines />
      </View>

      <Badge size={badgeSize} style={{ top: size * 0.02, left: size * 0.28 }} />
      <Badge size={badgeSize} style={{ top: size * 0.02, right: size * 0.28 }} />
      <Badge size={badgeSize} style={{ bottom: size * 0.02, left: size * 0.28 }} />
      <Badge size={badgeSize} style={{ bottom: size * 0.02, right: size * 0.28 }} />
    </View>
  );
}
