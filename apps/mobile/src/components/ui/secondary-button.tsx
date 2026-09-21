import { Pressable, StyleSheet, Text, type PressableProps } from 'react-native';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';

interface SecondaryButtonProps extends Omit<PressableProps, 'style' | 'children'> {
  label: string;
}

/** Orange outline button — e.g. "Xem chi tiết tiến trình" on screen-07. */
export function SecondaryButton({ label, disabled, ...pressableProps }: SecondaryButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      style={[styles.button, disabled && styles.buttonDisabled]}
      {...pressableProps}
    >
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: colors.primary,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: { opacity: 0.5 },
  label: { ...typography.button, color: colors.primaryStrong },
});
