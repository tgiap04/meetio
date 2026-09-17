import { StyleSheet, Text, View } from 'react-native';
import { BrandedParagraph } from '../branded-paragraph';
import { OnboardingArt } from '../illustrations/onboarding-art';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import type { OnboardingPage as OnboardingPageContent } from '../../content/onboarding-pages';

/**
 * One page of the onboarding pager (design.png, screen 2): illustration,
 * two-line heading, and a body paragraph with "Meetio" bolded inline. `width`
 * comes from the parent's `useWindowDimensions()` so each page fills exactly
 * one screen width inside the paging `ScrollView`.
 */
export interface OnboardingPageProps {
  page: OnboardingPageContent;
  width: number;
}

export function OnboardingPage({ page, width }: OnboardingPageProps) {
  return (
    <View style={[styles.container, { width }]}>
      <OnboardingArt size={width * 0.6} />
      <Text style={styles.title}>{page.title}</Text>
      <BrandedParagraph style={styles.body} text={page.body} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 },
  title: { ...typography.heading, color: colors.text, textAlign: 'center' },
  body: { ...typography.body, color: colors.textMuted, textAlign: 'center' },
});
