import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { RunConfig } from '../run-config';

type Option<T> = { value: T; label: string };

function Segmented<T extends string | number>(props: {
  label: string;
  value: T;
  options: Option<T>[];
  disabled: boolean;
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{props.label}</Text>
      <View style={styles.options}>
        {props.options.map((o) => (
          <Pressable
            key={String(o.value)}
            disabled={props.disabled}
            onPress={() => props.onChange(o.value)}
            style={[
              styles.option,
              o.value === props.value && styles.selected,
              props.disabled && styles.disabled,
            ]}
          >
            <Text style={o.value === props.value ? styles.selectedText : undefined}>{o.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export function RunConfigForm({
  config,
  disabled,
  onChange,
}: {
  config: RunConfig;
  disabled: boolean;
  onChange: (c: RunConfig) => void;
}) {
  return (
    <View>
      <Segmented
        label="Engine"
        value={config.engine}
        disabled={disabled}
        options={[
          { value: 'on-device', label: 'On-device' },
          { value: 'network', label: 'Network' },
        ]}
        onChange={(engine) => onChange({ ...config, engine })}
      />
      <Segmented
        label="Trạng thái app"
        value={config.appState}
        disabled={disabled}
        options={[
          { value: 'foreground', label: 'Tiền cảnh' },
          { value: 'background', label: 'Chạy nền' },
          { value: 'locked', label: 'Khoá màn hình' },
        ]}
        onChange={(appState) => onChange({ ...config, appState })}
      />
      <Segmented
        label="Cách thu"
        value={config.placement}
        disabled={disabled}
        options={[
          { value: 'laptop-speaker', label: 'Loa laptop' },
          { value: 'direct-voice', label: 'Nói trực tiếp' },
        ]}
        onChange={(placement) => onChange({ ...config, placement })}
      />
      <Segmented
        label="Khoảng cách"
        value={config.distanceCm}
        disabled={disabled}
        options={[
          { value: 30, label: '30cm' },
          { value: 50, label: '50cm' },
        ]}
        onChange={(distanceCm) => onChange({ ...config, distanceCm })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { marginBottom: 10 },
  label: { fontWeight: '600', marginBottom: 4 },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  option: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#999',
  },
  selected: { backgroundColor: '#1f2937', borderColor: '#1f2937' },
  selectedText: { color: '#fff' },
  disabled: { opacity: 0.5 },
});
