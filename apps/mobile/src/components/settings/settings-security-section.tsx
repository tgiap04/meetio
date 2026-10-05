import { useEffect, useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { SectionHeading } from '../ui/section-heading';
import { SurfaceCard } from '../ui/surface-card';
import { authenticate, canUseAppLock } from '../../security/biometric-auth';
import { useAppLockStore } from '../../security/app-lock.store';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';

/**
 * "Khoá bằng vân tay". Both directions ask for the fingerprint first: turning it on proves the
 * user can actually unlock (no locking yourself out), turning it off stops someone holding an
 * unlocked phone from silently removing the lock.
 */
export function SettingsSecuritySection() {
  const enabled = useAppLockStore((s) => s.enabled);
  const setEnabled = useAppLockStore((s) => s.setEnabled);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void canUseAppLock().then((ok) => !cancelled && setAvailable(ok));
    return () => {
      cancelled = true;
    };
  }, []);

  async function toggle(next: boolean) {
    setBusy(true);
    try {
      const ok = await authenticate(next ? 'Xác thực để bật khoá Meetio' : 'Xác thực để tắt khoá Meetio');
      if (ok) await setEnabled(next);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.container}>
      <SectionHeading title="Bảo mật" />
      <SurfaceCard style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Khoá bằng vân tay</Text>
          <Switch
            disabled={!available || busy}
            onValueChange={(next) => void toggle(next)}
            testID="settings-app-lock-switch"
            value={enabled}
          />
        </View>
        <Text style={styles.hint}>
          {available === false
            ? 'Máy chưa cài vân tay hay mã khoá màn hình, nên chưa bật được.'
            : 'Hỏi vân tay khi mở app hoặc quay lại sau 30 giây. Đang ghi âm vẫn ghi tiếp khi app khoá.'}
        </Text>
      </SurfaceCard>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 12 },
  card: { gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowLabel: { ...typography.label, color: colors.text },
  hint: { ...typography.caption, color: colors.textMuted },
});
