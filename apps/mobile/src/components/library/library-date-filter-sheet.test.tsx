import TestRenderer, { act } from 'react-test-renderer';
import { Alert, Text, TextInput } from 'react-native';
import { LibraryDateFilterSheet } from './library-date-filter-sheet';

function render(props: Partial<Parameters<typeof LibraryDateFilterSheet>[0]> = {}) {
  const merged = {
    visible: true,
    initialRange: { from: null, to: null },
    onApply: jest.fn(),
    onClose: jest.fn(),
    ...props,
  };
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<LibraryDateFilterSheet {...merged} />);
  });
  return { renderer, ...merged };
}

function findButtonByLabel(renderer: TestRenderer.ReactTestRenderer, label: string) {
  return renderer.root
    .findAll((node) => node.props.accessibilityRole === 'button' && typeof node.props.onPress === 'function')
    .find((node) => node.findAllByType(Text).some((t) => t.props.children === label));
}

function textInputs(renderer: TestRenderer.ReactTestRenderer) {
  return renderer.root.findAllByType(TextInput);
}

describe('LibraryDateFilterSheet', () => {
  beforeEach(() => {
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    (Alert.alert as jest.Mock).mockRestore();
  });

  it('starts empty when no initial range is set', () => {
    const { renderer } = render();
    const [fromInput, toInput] = textInputs(renderer);
    expect(fromInput.props.value).toBe('');
    expect(toInput.props.value).toBe('');
  });

  it('pre-fills from the initial range formatted as DD/MM/YYYY', () => {
    const { renderer } = render({
      initialRange: { from: '2026-09-01T12:00:00.000Z', to: '2026-09-25T12:00:00.000Z' },
    });
    const [fromInput, toInput] = textInputs(renderer);
    expect(fromInput.props.value).toMatch(/^\d{2}\/\d{2}\/2026$/);
    expect(toInput.props.value).toMatch(/^\d{2}\/\d{2}\/2026$/);
  });

  it('applies a preset by filling both fields with a computed range', () => {
    const { renderer } = render();
    act(() => {
      findButtonByLabel(renderer, '7 ngày qua')?.props.onPress();
    });
    const [fromInput, toInput] = textInputs(renderer);
    expect(fromInput.props.value).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    expect(toInput.props.value).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
  });

  it('applies a valid custom range as start/end-of-day (in local time) ISO bounds', () => {
    const onApply = jest.fn();
    const { renderer } = render({ onApply });
    const [fromInput, toInput] = textInputs(renderer);
    act(() => fromInput.props.onChangeText('01/09/2026'));
    act(() => toInput.props.onChangeText('25/09/2026'));
    act(() => {
      findButtonByLabel(renderer, 'Áp dụng')?.props.onPress();
    });
    expect(onApply).toHaveBeenCalledTimes(1);
    const [{ from, to }] = onApply.mock.calls[0];
    // Compared as local calendar dates/times, not UTC-prefix string matching
    // — the ISO string's UTC offset from local midnight depends on the test
    // runner's time zone (same reasoning as `date-range-formatting.test.ts`).
    const fromDate = new Date(from);
    const toDate = new Date(to);
    expect([fromDate.getDate(), fromDate.getMonth(), fromDate.getHours(), fromDate.getMinutes()]).toEqual([
      1, 8, 0, 0,
    ]);
    expect([toDate.getDate(), toDate.getMonth(), toDate.getHours(), toDate.getMinutes()]).toEqual([25, 8, 23, 59]);
  });

  it('rejects an invalid date and does not call onApply', () => {
    const onApply = jest.fn();
    const { renderer } = render({ onApply });
    const [fromInput] = textInputs(renderer);
    act(() => fromInput.props.onChangeText('31/02/2026')); // not a real date
    act(() => {
      findButtonByLabel(renderer, 'Áp dụng')?.props.onPress();
    });
    expect(Alert.alert).toHaveBeenCalledWith('Ngày không hợp lệ', expect.any(String));
    expect(onApply).not.toHaveBeenCalled();
  });

  it('applies with both bounds null when both fields are left blank', () => {
    const onApply = jest.fn();
    const { renderer } = render({ onApply });
    act(() => {
      findButtonByLabel(renderer, 'Áp dụng')?.props.onPress();
    });
    expect(onApply).toHaveBeenCalledWith({ from: null, to: null });
  });

  it('clearing resets both fields and applies null bounds', () => {
    const onApply = jest.fn();
    const { renderer } = render({
      onApply,
      initialRange: { from: '2026-09-01T12:00:00.000Z', to: '2026-09-25T12:00:00.000Z' },
    });
    act(() => {
      findButtonByLabel(renderer, 'Xóa bộ lọc')?.props.onPress();
    });
    expect(onApply).toHaveBeenCalledWith({ from: null, to: null });
    const [fromInput, toInput] = textInputs(renderer);
    expect(fromInput.props.value).toBe('');
    expect(toInput.props.value).toBe('');
  });

  it('calls onClose when Hủy is tapped', () => {
    const onClose = jest.fn();
    const { renderer } = render({ onClose });
    act(() => {
      findButtonByLabel(renderer, 'Hủy')?.props.onPress();
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
