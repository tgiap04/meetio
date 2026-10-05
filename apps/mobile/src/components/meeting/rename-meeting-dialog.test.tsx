import TestRenderer, { act } from 'react-test-renderer';
import { ActivityIndicator, Modal, Text, TextInput } from 'react-native';
import { RenameMeetingDialog, type RenameMeetingDialogProps } from './rename-meeting-dialog';

jest.mock('../qa/qa-keyboard-aware-container', () => ({ useKeyboardHeight: () => 0 }));

const renderers: TestRenderer.ReactTestRenderer[] = [];

function render(overrides: Partial<RenameMeetingDialogProps> = {}) {
  const props: RenameMeetingDialogProps = {
    visible: true,
    initialTitle: 'Sprint Review',
    saving: false,
    errorMessage: null,
    onCancel: jest.fn(),
    onSave: jest.fn(),
    ...overrides,
  };
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<RenameMeetingDialog {...props} />);
  });
  renderers.push(renderer);
  return { renderer, props };
}

const input = (r: TestRenderer.ReactTestRenderer) => r.root.findByType(TextInput);
const saveButton = (r: TestRenderer.ReactTestRenderer) => r.root.findByProps({ accessibilityLabel: 'Lưu' });
const texts = (r: TestRenderer.ReactTestRenderer) =>
  r.root.findAllByType(Text).map((n) => n.props.children).flat();

describe('RenameMeetingDialog', () => {
  afterEach(() => {
    while (renderers.length > 0) {
      act(() => renderers.pop()?.unmount());
    }
  });

  it('is a transparent fading modal that closes on Android back', () => {
    const { renderer, props } = render();
    const modal = renderer.root.findByType(Modal);
    expect(modal.props.transparent).toBe(true);
    expect(modal.props.animationType).toBe('fade');
    act(() => modal.props.onRequestClose());
    expect(props.onCancel).toHaveBeenCalledTimes(1);
  });

  it('shows title, prefilled focused input, helper and counter', () => {
    const { renderer } = render();
    expect(texts(renderer)).toEqual(
      expect.arrayContaining(['Đổi tên cuộc họp', 'Để trống để dùng tên mặc định', '13/200']),
    );
    expect(input(renderer).props).toMatchObject({
      value: 'Sprint Review',
      autoFocus: true,
      selectTextOnFocus: true,
      maxLength: 200,
      returnKeyType: 'done',
    });
  });

  it('updates the counter as the user types', () => {
    const { renderer } = render();
    act(() => input(renderer).props.onChangeText('Abc'));
    expect(texts(renderer)).toContain('3/200');
  });

  it('disables Lưu while the title is unchanged after trim', () => {
    const { renderer, props } = render();
    expect(saveButton(renderer).props.disabled).toBe(true);
    act(() => input(renderer).props.onChangeText('  Sprint Review  '));
    expect(saveButton(renderer).props.disabled).toBe(true);
    act(() => input(renderer).props.onSubmitEditing());
    expect(props.onSave).not.toHaveBeenCalled();
  });

  it('saves the trimmed title from the button and from the keyboard done key', () => {
    const { renderer, props } = render();
    act(() => input(renderer).props.onChangeText('  Retro  '));
    expect(saveButton(renderer).props.disabled).toBe(false);
    act(() => saveButton(renderer).props.onPress());
    expect(props.onSave).toHaveBeenLastCalledWith('Retro');
    act(() => input(renderer).props.onSubmitEditing());
    expect(props.onSave).toHaveBeenCalledTimes(2);
  });

  it('allows a blank title and sends an empty string', () => {
    const { renderer, props } = render();
    act(() => input(renderer).props.onChangeText('   '));
    expect(saveButton(renderer).props.disabled).toBe(false);
    act(() => saveButton(renderer).props.onPress());
    expect(props.onSave).toHaveBeenCalledWith('');
  });

  it('shows a spinner and blocks saving while saving', () => {
    const { renderer, props } = render({ saving: true });
    act(() => input(renderer).props.onChangeText('Retro'));
    expect(renderer.root.findAllByType(ActivityIndicator)).toHaveLength(1);
    expect(saveButton(renderer).props.disabled).toBe(true);
    expect(input(renderer).props.editable).toBe(false);
    act(() => input(renderer).props.onSubmitEditing());
    expect(props.onSave).not.toHaveBeenCalled();
  });

  it('shows the inline error message when given', () => {
    const { renderer } = render({ errorMessage: 'Không đổi được tên — kiểm tra kết nối rồi thử lại.' });
    expect(texts(renderer)).toContain('Không đổi được tên — kiểm tra kết nối rồi thử lại.');
  });

  it('uses translucent system bars and ignores back / Hủy while saving', () => {
    const { renderer, props } = render({ saving: true });
    const modal = renderer.root.findByType(Modal);
    expect(modal.props.statusBarTranslucent).toBe(true);
    expect(modal.props.navigationBarTranslucent).toBe(true);
    act(() => modal.props.onRequestClose());
    const cancel = renderer.root.findByProps({ accessibilityLabel: 'Hủy' });
    expect(cancel.props.disabled).toBe(true);
    act(() => cancel.props.onPress?.());
    expect(props.onCancel).not.toHaveBeenCalled();
  });

  it('Hủy calls onCancel', () => {
    const { renderer, props } = render();
    act(() => renderer.root.findByProps({ accessibilityLabel: 'Hủy' }).props.onPress());
    expect(props.onCancel).toHaveBeenCalledTimes(1);
  });

  it('re-prefills when reopened for another meeting', () => {
    const { renderer, props } = render();
    act(() => input(renderer).props.onChangeText('typed'));
    act(() => renderer.update(<RenameMeetingDialog {...props} initialTitle="Other" />));
    expect(input(renderer).props.value).toBe('Other');
  });
});
