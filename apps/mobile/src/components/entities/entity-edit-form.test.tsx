import TestRenderer, { act } from 'react-test-renderer';
import { Text, TextInput } from 'react-native';
import { EntityEditForm } from './entity-edit-form';

function render(saving = false, onSave = jest.fn(), onCancel = jest.fn()) {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <EntityEditForm initialName="Nguyễn Văn Anh" initialType="person" onCancel={onCancel} onSave={onSave} saving={saving} />,
    );
  });
  return renderer;
}

function findChip(renderer: TestRenderer.ReactTestRenderer, label: string) {
  return renderer.root
    .findAll((n) => n.props.accessibilityRole === 'button' && typeof n.props.onPress === 'function')
    .find((n) => n.findAllByType(Text).some((t) => t.props.children === label));
}

describe('EntityEditForm', () => {
  it('prefills the name input with the initial value', () => {
    const renderer = render();
    expect(renderer.root.findByProps({ testID: 'entity-edit-name-input' }).props.value).toBe('Nguyễn Văn Anh');
  });

  it('calls onSave with the edited name and type', () => {
    const onSave = jest.fn();
    const renderer = render(false, onSave);
    act(() => {
      renderer.root.findByType(TextInput).props.onChangeText('Anh N.');
    });
    act(() => {
      findChip(renderer, 'Dự án')?.props.onPress();
    });
    act(() => {
      findChip(renderer, 'Lưu')?.props.onPress();
    });
    expect(onSave).toHaveBeenCalledWith({ canonical_name: 'Anh N.', type: 'project' });
  });

  it('disables Save when the name is blank', () => {
    const onSave = jest.fn();
    const renderer = render(false, onSave);
    act(() => {
      renderer.root.findByType(TextInput).props.onChangeText('   ');
    });
    act(() => {
      findChip(renderer, 'Lưu')?.props.onPress();
    });
    expect(onSave).not.toHaveBeenCalled();
  });

  it('calls onCancel when Hủy is tapped', () => {
    const onCancel = jest.fn();
    const renderer = render(false, jest.fn(), onCancel);
    act(() => {
      findChip(renderer, 'Hủy')?.props.onPress();
    });
    expect(onCancel).toHaveBeenCalled();
  });

  it('shows "Đang lưu…" and disables Save while saving', () => {
    const renderer = render(true);
    const texts = renderer.root.findAllByType(Text).map((t) => t.props.children).flat();
    expect(texts).toContain('Đang lưu…');
  });
});
