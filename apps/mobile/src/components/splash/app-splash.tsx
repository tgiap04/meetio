import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { AppMark } from '../illustrations/app-mark';
import { Blob } from '../illustrations/blob';
import { PagerDots } from '../pager-dots';

const BLOB_SIZE = 220;

/**
 * Design screen 1, and the boot gate's held content (decisions.md §1): what
 * the app shows while session, preferences and the minimum-delay timer are
 * all still in flight. Deliberately static and provider-free — no Query, no
 * router — so it can render before any of the app's state is known.
 */
export function AppSplash() {
  return (
    <View testID="app-splash" style={styles.container}>
      <View style={styles.blobLayer} pointerEvents="none">
        <View style={styles.blobTopRight}>
          <Blob size={BLOB_SIZE} variant="topRight" testID="app-splash-blob-top-right" />
        </View>
        <View style={styles.blobBottomLeft}>
          <Blob size={BLOB_SIZE} variant="bottomLeft" testID="app-splash-blob-bottom-left" />
        </View>
      </View>

      <View style={styles.content}>
        <AppMark size={88} testID="app-splash-mark" />
        <Text style={styles.wordmark}>Meetio</Text>
        <Text testID="app-splash-tagline" style={styles.tagline}>
          {'Ghi âm mọi cuộc họp,\nbiến lời nói thành tri thức.'}
        </Text>
      </View>

      <View style={styles.dotsLayer}>
        <PagerDots count={3} activeIndex={0} testID="app-splash-dots" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  blobLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  blobTopRight: {
    position: 'absolute',
    top: -BLOB_SIZE * 0.35,
    right: -BLOB_SIZE * 0.35,
  },
  blobBottomLeft: {
    position: 'absolute',
    bottom: -BLOB_SIZE * 0.35,
    left: -BLOB_SIZE * 0.35,
  },
  content: {
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 32,
  },
  wordmark: {
    ...typography.display,
    color: colors.text,
  },
  tagline: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
  },
  dotsLayer: {
    position: 'absolute',
    bottom: 48,
  },
});
