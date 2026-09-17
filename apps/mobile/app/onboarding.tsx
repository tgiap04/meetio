import { useRef, useState } from 'react';
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { ScreenBackdrop } from '../src/components/illustrations/screen-backdrop';
import { OnboardingPage } from '../src/components/onboarding/onboarding-page';
import { PagerDots } from '../src/components/pager-dots';
import { PrimaryButton } from '../src/components/primary-button';
import { ONBOARDING_PAGES } from '../src/content/onboarding-pages';
import { useCompleteOnboarding } from '../src/hooks/use-complete-onboarding';
import { colors } from '../src/theme/colors';
import { typography } from '../src/theme/typography';

const LAST_PAGE_INDEX = ONBOARDING_PAGES.length - 1;

export default function OnboardingScreen() {
  const { width } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const complete = useCompleteOnboarding();

  function handleMomentumScrollEnd(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const index = Math.round(event.nativeEvent.contentOffset.x / width);
    setPageIndex(index);
  }

  function handlePrimaryPress() {
    if (pageIndex < LAST_PAGE_INDEX) {
      scrollRef.current?.scrollTo({ x: (pageIndex + 1) * width, animated: true });
      return;
    }
    complete();
  }

  return (
    <View style={styles.container}>
      <ScreenBackdrop width={width} testID="onboarding-backdrop" />
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleMomentumScrollEnd}
      >
        {ONBOARDING_PAGES.map((page) => (
          <OnboardingPage key={page.key} page={page} width={width} />
        ))}
      </ScrollView>

      <View style={styles.footer}>
        <View style={styles.centered}>
          <PagerDots count={ONBOARDING_PAGES.length} activeIndex={pageIndex} testID="onboarding-pager-dots" />
        </View>
        <PrimaryButton label="Bắt đầu" onPress={handlePrimaryPress} testID="onboarding-primary-button" />
        <Pressable
          accessibilityRole="button"
          onPress={complete}
          style={styles.centered}
          testID="onboarding-skip-button"
        >
          <Text style={styles.skip}>Bỏ qua</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  footer: { paddingHorizontal: 24, paddingBottom: 24, gap: 16 },
  centered: { alignItems: 'center' },
  skip: { ...typography.body, color: colors.primaryStrong },
});
