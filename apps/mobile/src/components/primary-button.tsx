import { ActivityIndicator, Pressable, StyleSheet, Text, type PressableProps } from 'react-native';
import { BrandFill } from './illustrations/brand-fill';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';

interface PrimaryButtonProps extends Omit<PressableProps, 'style' | 'children'> {
  label: string;
  loading?: boolean;
}

export function PrimaryButton({ label, loading = false, disabled, ...pressableProps }: PrimaryButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled }}
      disabled={isDisabled}
      style={isDisabled && styles.buttonDisabled}
      {...pressableProps}
    >
      <BrandFill style={styles.fill}>
        {loading ? (
          <ActivityIndicator color={colors.primaryText} />
        ) : (
          <Text style={styles.label}>{label}</Text>
        )}
      </BrandFill>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // `borderRadius` lives on the gradient itself, not this wrapper — a radius
  // on the Pressable alone would let the gradient's square corners show through.
  fill: {
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: { opacity: 0.5 },
  label: { ...typography.button, color: colors.primaryText },
});
