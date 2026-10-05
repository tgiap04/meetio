import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';
import { authenticate } from '../../security/biometric-auth';
import { useAppLockStore } from '../../security/app-lock.store';
import { useAppLockLifecycle } from '../../hooks/use-app-lock-lifecycle';
import { AppMark } from '../illustrations/app-mark';
import { PrimaryButton } from '../primary-button';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';

/**
 * Covers the `(app)` group with a lock screen when the biometric lock is on. The children stay
 * mounted underneath — the navigation stack (and a recording screen in it) survives a lock, and
 * deep links from the widget, a shortcut or the recording notification land behind the cover.
 */
export function AppLockGate({ children }: { children: ReactNode }) {
  const status = useAppLockStore((s) => s.status);
  const locked = useAppLockStore((s) => s.locked);
  const unlock = useAppLockStore((s) => s.unlock);
  const prompting = useRef(false);
  const isPrompting = useCallback(() => prompting.current, []);
  useAppLockLifecycle(isPrompting);

  const promptUnlock = useCallback(async () => {
    if (prompting.current) return;
    prompting.current = true;
    const ok = await authenticate('Mở khoá Meetio');
    prompting.current = false;
    if (ok) unlock();
  }, [unlock]);

  // Ask straight away when the cover appears in the foreground; the button is the retry path.
  useEffect(() => {
    if (locked && AppState.currentState === 'active') void promptUnlock();
  }, [locked, promptUnlock]);

  const covered = status === 'hydrating' || locked;
  return (
    <View style={styles.root}>
      {/* Mounted but unreachable while covered: TalkBack must not read meetings behind the lock. */}
      <View importantForAccessibility={covered ? 'no-hide-descendants' : 'auto'} style={styles.root}>
        {children}
      </View>
      {covered ? (
        <View accessibilityViewIsModal style={styles.cover} testID="app-lock-cover">
          {locked ? (
            <View style={styles.content}>
              <AppMark size={72} />
              <Text style={styles.title}>Meetio đang khoá</Text>
              <Text style={styles.body}>Xác thực bằng vân tay hoặc mã khoá máy để xem cuộc họp.</Text>
              <PrimaryButton label="Mở khoá" onPress={() => void promptUnlock()} testID="app-lock-unlock" />
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  cover: { ...StyleSheet.absoluteFill, backgroundColor: colors.surface, justifyContent: 'center' },
  content: { alignItems: 'center', gap: 16, paddingHorizontal: 32 },
  title: { ...typography.heading, color: colors.text, textAlign: 'center' },
  body: { ...typography.body, color: colors.textMuted, textAlign: 'center' },
});
