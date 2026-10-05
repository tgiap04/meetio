import TestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { TranslationSection, TRANSLATION_COST_NOTE } from './translation-section';

const mounted: TestRenderer.ReactTestRenderer[] = [];
afterEach(() => act(() => mounted.splice(0).forEach((r) => r.unmount())));

function render(props: Partial<Parameters<typeof TranslationSection>[0]> = {}) {
  const onChange = jest.fn();
  let r!: TestRenderer.ReactTestRenderer;
  act(() => {
    r = TestRenderer.create(<TranslationSection language="vi-VN" onChange={onChange} translateTo={null} {...props} />);
  });
  mounted.push(r);
  return { r, onChange };
}
const texts = (r: TestRenderer.ReactTestRenderer) => r.root.findAllByType(Text).map((n) => n.props.children);
const radio = (r: TestRenderer.ReactTestRenderer, label: string) =>
  r.root.findAll((n) => n.props.accessibilityRole === 'radio' && n.props.accessibilityLabel === label && typeof n.props.onPress === 'function')[0];

describe('TranslationSection', () => {
  it('offers "Không dịch" (selected by default) and the other language, with no cost note while off', () => {
    const { r } = render();
    expect(texts(r)).toEqual(expect.arrayContaining(['Dịch sang', 'Không dịch', 'Tiếng Anh']));
    expect(radio(r, 'Không dịch').props.accessibilityState).toEqual({ selected: true });
    expect(radio(r, 'Tiếng Anh').props.accessibilityState).toEqual({ selected: false });
    expect(texts(r)).not.toContain(TRANSLATION_COST_NOTE);
  });

  it('offers Tiếng Việt, not itself, when recording in English', () => {
    const { r } = render({ language: 'en-US' });
    expect(texts(r)).toContain('Tiếng Việt');
    expect(texts(r)).not.toContain('Tiếng Anh');
  });

  it('choosing a language reports it and the cost note appears once it is on', () => {
    const { r, onChange } = render();
    act(() => radio(r, 'Tiếng Anh').props.onPress());
    expect(onChange).toHaveBeenCalledWith('en-US');
    act(() => r.update(<TranslationSection language="vi-VN" onChange={onChange} translateTo="en-US" />));
    expect(texts(r)).toContain('Dịch dùng thêm AI cho mỗi câu — tốn chi phí hơn.');
    expect(radio(r, 'Tiếng Anh').props.accessibilityState).toEqual({ selected: true });
  });

  it('choosing "Không dịch" reports null', () => {
    const { r, onChange } = render({ translateTo: 'en-US' });
    act(() => radio(r, 'Không dịch').props.onPress());
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('renders nothing until a language is known', () => {
    expect(render({ language: null }).r.toJSON()).toBeNull();
  });
});
