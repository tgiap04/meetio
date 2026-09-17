import { StyleSheet, Text, type TextProps } from 'react-native';

/**
 * Bolds every occurrence of "Meetio" inside a paragraph, leaving the rest of
 * the text untouched. Used on onboarding page 1 and the permission screen,
 * both of which weave the brand name mid-sentence in `design.png`.
 */
export interface BrandedParagraphProps {
  text: string;
  style?: TextProps['style'];
  testID?: string;
}

const BRAND = 'Meetio';

export function BrandedParagraph({ text, style, testID }: BrandedParagraphProps) {
  const segments = text.split(BRAND);

  return (
    <Text testID={testID} style={style}>
      {segments.map((segment, index) => (
        <Text key={index}>
          {segment}
          {index < segments.length - 1 ? <Text style={styles.brand}>{BRAND}</Text> : null}
        </Text>
      ))}
    </Text>
  );
}

const styles = StyleSheet.create({
  brand: { fontWeight: '700' },
});
