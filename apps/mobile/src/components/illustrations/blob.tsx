import { View } from 'react-native';
import { colors } from '../../theme/colors';

/**
 * The organic peach shape behind the splash wordmark (design screen 1, top
 * corners). Built as one rounded rect with four different corner radii so it
 * reads as "blob" rather than "rounded rectangle" — no path/SVG needed.
 */
export type BlobVariant = 'topRight' | 'bottomLeft';

export interface BlobProps {
  size: number;
  variant: BlobVariant;
  testID?: string;
}

export function Blob({ size, variant, testID }: BlobProps) {
  const radii =
    variant === 'topRight'
      ? {
          borderTopLeftRadius: size * 0.5,
          borderTopRightRadius: size * 0.12,
          borderBottomRightRadius: size * 0.55,
          borderBottomLeftRadius: size * 0.4,
        }
      : {
          borderTopLeftRadius: size * 0.55,
          borderTopRightRadius: size * 0.4,
          borderBottomRightRadius: size * 0.5,
          borderBottomLeftRadius: size * 0.12,
        };

  return (
    <View
      testID={testID}
      style={{
        width: size,
        height: size * 0.85,
        backgroundColor: colors.primaryTint,
        ...radii,
      }}
    />
  );
}
