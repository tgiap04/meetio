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
import { ScreenSurface } from '../src/components/ui/screen-surface';
import { ScreenBackdrop } from '../src/components/illustrations/screen-backdrop';
import { OnboardingPage } from '../src/components/onboarding/onboarding-page';
import { PagerDots } from '../src/components/pager-dots';
import { PrimaryButton } from '../src/components/primary-button';
import { ONBOARDING_PAGES } from '../src/content/onboarding-pages';
import { useCompleteOnboarding } from '../src/hooks/use-complete-onboarding';
import { colors } from '../src/theme/colors';
import { typography } from '../src/theme/typography';

const LAST_PAGE_INDEX = ONBOARDING_PAGES.length - 1;

/**
 * LỆCH design.png CÓ CHỦ Ý — đừng "sửa lại cho khớp thiết kế".
 *
 * Màn 2 trong `design.png` vẽ trang 1/3 (chấm đầu đang active) với nhãn "Bắt đầu".
 * Nhưng ở trang 1 và 2, bấm nút chỉ cuộn sang trang kế chứ không vào app — nhãn
 * "Bắt đầu" ở đó hứa một việc mà nút không làm. Chỉ trang cuối mới thật sự bắt đầu.
 */
const PRIMARY_LABEL_LAST = 'Bắt đầu';
const PRIMARY_LABEL_ADVANCE = 'Tiếp tục';

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
      <ScreenSurface style={styles.content}>
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
            <PagerDots
              count={ONBOARDING_PAGES.length}
              activeIndex={pageIndex}
              testID="onboarding-pager-dots"
            />
          </View>
          <PrimaryButton
            label={pageIndex < LAST_PAGE_INDEX ? PRIMARY_LABEL_ADVANCE : PRIMARY_LABEL_LAST}
            onPress={handlePrimaryPress}
            testID="onboarding-primary-button"
          />
          <Pressable
            accessibilityRole="button"
            onPress={complete}
            style={styles.centered}
            testID="onboarding-skip-button"
          >
            <Text style={styles.skip}>Bỏ qua</Text>
          </Pressable>
        </View>
      </ScreenSurface>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  // Trong suốt: nền hoa văn nằm dưới và phải chạy hết mép trên.
  content: { backgroundColor: 'transparent' },
  footer: { paddingHorizontal: 24, paddingBottom: 24, gap: 16 },
  centered: { alignItems: 'center' },
  // Xám câm theo design, không phải cam — khớp với "Không, để sau" ở màn quyền
  // micro. `lineHeight: 44` giữ vùng chạm ở sàn 44pt: bỏ màu nhấn đi rồi thì
  // càng không được để link chỉ cao bằng một dòng chữ 16pt.
  skip: { ...typography.body, color: colors.textMuted, lineHeight: 44 },
});
