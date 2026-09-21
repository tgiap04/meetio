import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  PixelRatio,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppMark } from '../illustrations/app-mark';
import { ScreenBackdrop } from '../illustrations/screen-backdrop';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';

/**
 * The shared chrome behind both auth screens: peach backdrop, brand lockup,
 * heading, and a keyboard-safe slot for the form.
 *
 * ## Derived from screens 1–4, not from a design that does not exist
 *
 * `design.png` has no login or register screen. The backdrop and the gradient
 * mark come straight from the accepted screens 1–3; the *arrangement* comes from
 * screen 4 ("Trang chủ"), the only screen in the design that puts the mark and
 * the wordmark on one row at the top of a working screen and then left-aligns a
 * bold heading and a muted paragraph beneath them.
 *
 * Left-aligned, and for three reasons: it shares an axis with `TextField`'s
 * left-aligned labels, so the form reads as one column rather than two; it is
 * what screen 4 does; and an inline lockup is roughly 60pt shorter than the
 * stacked, centred lockup on the splash — which is 60pt the keyboard does not
 * get to take away.
 *
 * ## The keyboard is this component's actual job
 *
 * Screens 1–3 have no inputs, so they could ignore it. Here the submit button
 * sits below the fields and would end up under the keyboard on a small device.
 * `KeyboardAvoidingView` + `ScrollView` keeps it reachable, and the backdrop
 * stays outside both so the decoration never jumps when the keyboard animates.
 *
 * `keyboardShouldPersistTaps="handled"` — deliberately not `"always"`, which
 * keeps the keyboard up through every touch and makes a mis-tap on the submit
 * button easy (see the phase file's security note).
 *
 * ## Hierarchy
 *
 * The wordmark is larger (24) but lighter (600); the title is smaller (22) but
 * heavier (700). Two different axes, so the page title leads without the brand
 * lockup having to shrink. `typography.display` is not used here — that token is
 * documented as "the single largest text in the app" and belongs to the splash.
 *
 * Purely presentational: no router, no store, no query client, no native module.
 * `useWindowDimensions` is core React Native layout, and `ScreenBackdrop`
 * requires the width to scale its blobs (`Dimensions.get` would not update on
 * rotation). Phase 10 supplies behaviour.
 */
const MARK_SIZE = 32;

/** Vietnamese stacks tone marks over base diacritics ("ệ", "ườ"), so the muted
 *  paragraph needs more leading than the font's default. Multiplied by the live
 *  font scale rather than hard-coded, otherwise the text grows under Dynamic
 *  Type while its line box does not, and the diacritics clip. */
const SUBTITLE_LINE_HEIGHT_RATIO = 1.5;

export interface AuthScreenShellProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  testID?: string;
}

export function AuthScreenShell({ title, subtitle, children, testID }: AuthScreenShellProps) {
  const { width } = useWindowDimensions();
  // The backdrop stays full-bleed behind the status bar; only the content is
  // inset, or the brand lockup lands under the clock on a short device.
  const insets = useSafeAreaInsets();
  const subtitleLineHeight = Math.round(
    typography.body.fontSize * SUBTITLE_LINE_HEIGHT_RATIO * PixelRatio.getFontScale(),
  );

  return (
    <View testID={testID} style={styles.screen}>
      <ScreenBackdrop width={width} testID="auth-backdrop" />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingTop: styles.content.paddingVertical + insets.top },
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.lockup}>
            <AppMark size={MARK_SIZE} testID="auth-mark" />
            <Text style={styles.wordmark}>Meetio</Text>
          </View>

          <Text testID="auth-title" style={styles.title}>
            {title}
          </Text>

          {subtitle ? (
            <Text
              testID="auth-subtitle"
              style={[styles.subtitle, { lineHeight: subtitleLineHeight }]}
            >
              {subtitle}
            </Text>
          ) : null}

          <View style={styles.body}>{children}</View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  flex: { flex: 1 },
  // flexGrow + centre: short forms sit centred like screens 1–3; tall ones (or a
  // raised keyboard) scroll instead of being squashed.
  content: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 32 },
  // 32, not the 24 used between the other blocks: the brand lockup is a separate
  // register from the page content and needs to read as its own band.
  lockup: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 32 },
  wordmark: { ...typography.title, color: colors.text },
  title: { ...typography.heading, color: colors.text },
  subtitle: { ...typography.body, color: colors.textMuted, marginTop: 8 },
  body: { marginTop: 24, gap: 16 },
});
