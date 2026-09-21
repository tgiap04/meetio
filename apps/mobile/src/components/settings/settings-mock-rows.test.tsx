import TestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { SettingsMockRows } from './settings-mock-rows';
import { SETTINGS_ENTRIES } from '../../mocks';

function render(onRecordingSettingsPress: () => void) {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <SettingsMockRows entries={SETTINGS_ENTRIES} onRecordingSettingsPress={onRecordingSettingsPress} />,
    );
  });
  return renderer;
}

function findButton(renderer: TestRenderer.ReactTestRenderer, index: number) {
  return renderer.root.findAll(
    (node) => node.props.accessibilityRole === 'button' && typeof node.props.onPress === 'function',
  )[index];
}

describe('SettingsMockRows', () => {
  it('renders every design-sourced row label', () => {
    const renderer = render(jest.fn());
    const texts = renderer.root.findAllByType(Text).map((node) => node.props.children);
    for (const entry of SETTINGS_ENTRIES) {
      expect(texts).toContain(entry.label);
    }
  });

  it('routes "Cài đặt ghi âm" to the given handler', () => {
    const onRecordingSettingsPress = jest.fn();
    const renderer = render(onRecordingSettingsPress);
    // "Cài đặt ghi âm" is the only row with a working onPress (see the next
    // test), so it is the sole match in the filtered pressable list.
    act(() => {
      findButton(renderer, 0).props.onPress();
    });
    expect(onRecordingSettingsPress).toHaveBeenCalledTimes(1);
  });

  it('leaves the other four rows inert (no onPress)', () => {
    const renderer = render(jest.fn());
    const inertEntries = SETTINGS_ENTRIES.filter((entry) => entry.id !== 'recording-settings');
    for (const entry of inertEntries) {
      const rowLabel = renderer.root.findAllByType(Text).find((node) => node.props.children === entry.label);
      expect(rowLabel).toBeTruthy();
    }
    // Only one row (recording settings) has a working onPress.
    const pressableButtons = renderer.root.findAll(
      (node) => node.props.accessibilityRole === 'button' && typeof node.props.onPress === 'function',
    );
    expect(pressableButtons).toHaveLength(1);
  });
});
