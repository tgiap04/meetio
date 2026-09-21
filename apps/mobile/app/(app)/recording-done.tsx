import { router } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { AiProcessingNotice } from '../../src/components/recording-done/ai-processing-notice';
import { ProcessingStepRow } from '../../src/components/recording-done/processing-step-row';
import { RecordingDoneHero } from '../../src/components/recording-done/recording-done-hero';
import { ScreenHeader } from '../../src/components/ui/screen-header';
import { SecondaryButton } from '../../src/components/ui/secondary-button';
import { SurfaceCard } from '../../src/components/ui/surface-card';
import { MEETING_DETAIL_ROUTE, MEETING_GRAPH_ROUTE } from '../../src/navigation/app-routes';
import { colors } from '../../src/theme/colors';

/**
 * Screen 07 — reached after "Kết thúc" on the live recording screen (06), and
 * the last stop before screen 08's meeting overview (clarifications.md §5:
 * 06 → 07 → 08). The back chevron returns to the live screen via
 * `router.back()`; there is no title, matching the crop.
 *
 * The four pipeline rows below are a static snapshot, not a live status feed
 * — nothing here polls a job or advances a state over time (see
 * `AiProcessingNotice`'s prototype-honesty note on the "we'll notify you"
 * copy this screen can never actually fulfil).
 */
export default function RecordingDoneScreen() {
  function handleBack() {
    router.back();
  }

  function handleViewGraph() {
    router.push(MEETING_GRAPH_ROUTE);
  }

  function handleViewProgress() {
    router.push(MEETING_DETAIL_ROUTE);
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader onBack={handleBack} title="" />
      <ScrollView contentContainerStyle={styles.content}>
        <RecordingDoneHero />
        <AiProcessingNotice />
        <SurfaceCard>
          <ProcessingStepRow label="Transcript" showDivider state="done" />
          <ProcessingStepRow label="Embedding" showDivider state="done" />
          <ProcessingStepRow label="Knowledge Graph" onPress={handleViewGraph} showDivider state="active" />
          <ProcessingStepRow label="Tóm tắt & Action Items" state="pending" />
        </SurfaceCard>
        <SecondaryButton label="Xem chi tiết tiến trình" onPress={handleViewProgress} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  content: { padding: 16, gap: 16 },
});
