import TestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { SettingsRetentionPicker, RETENTION_OPTIONS } from './settings-retention-picker';

function render(value: number | null, onChange: jest.Mock) {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<SettingsRetentionPicker onChange={onChange} value={value} />);
  });
  return renderer;
}

function findChip(renderer: TestRenderer.ReactTestRenderer, label: string) {
  return renderer.root
    .findAll((node) => node.props.accessibilityRole === 'button' && typeof node.props.onPress === 'function')
    .find((node) => node.findAllByType(Text).some((t) => t.props.children === label));
}

describe('SettingsRetentionPicker', () => {
  it('renders all five fixed options', () => {
    const renderer = render(30, jest.fn());
    const texts = renderer.root.findAllByType(Text).map((node) => node.props.children);
    for (const option of RETENTION_OPTIONS) {
      expect(texts).toContain(option.label);
    }
  });

  it('marks the option matching the current value as selected', () => {
    const renderer = render(90, jest.fn());
    const selectedChip = findChip(renderer, '90 ngày');
    const otherChip = findChip(renderer, '30 ngày');
    expect(selectedChip?.props.accessibilityState).toEqual({ selected: true });
    expect(otherChip?.props.accessibilityState).toEqual({ selected: false });
  });

  it('treats null as "Không tự xóa" being selected', () => {
    const renderer = render(null, jest.fn());
    const chip = findChip(renderer, 'Không tự xóa');
    expect(chip?.props.accessibilityState).toEqual({ selected: true });
  });

  it('pressing a chip calls onChange with that option\'s days', () => {
    const onChange = jest.fn();
    const renderer = render(30, onChange);
    act(() => {
      findChip(renderer, '365 ngày')?.props.onPress();
    });
    expect(onChange).toHaveBeenCalledWith(365);
  });

  it('pressing "Không tự xóa" calls onChange with null', () => {
    const onChange = jest.fn();
    const renderer = render(30, onChange);
    act(() => {
      findChip(renderer, 'Không tự xóa')?.props.onPress();
    });
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('explains the retention effect for a chosen number of days', () => {
    const renderer = render(90, jest.fn());
    const texts = renderer.root.findAllByType(Text).map((node) => node.props.children);
    expect(texts.join(' ')).toContain('90 ngày kể từ khi kết thúc');
    expect(texts.join(' ')).toContain('nhắc trước 7 ngày');
  });

  it('explains "no automatic deletion" when value is null', () => {
    const renderer = render(null, jest.fn());
    const texts = renderer.root.findAllByType(Text).map((node) => node.props.children);
    expect(texts).toContain('Cuộc họp không tự xóa theo thời gian.');
  });
});
