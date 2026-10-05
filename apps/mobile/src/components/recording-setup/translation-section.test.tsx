import TestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { PACK_DOWNLOAD_LABEL, PACK_MISSING_NOTE, PACK_UNAVAILABLE_NOTE, TranslationSection, TRANSLATION_ON_DEVICE_NOTE } from './translation-section';

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
  it('offers "Không dịch" (selected by default) and the other language, with no note while off', () => {
    const { r } = render();
    expect(texts(r)).toEqual(expect.arrayContaining(['Dịch sang', 'Không dịch', 'Tiếng Anh']));
    expect(radio(r, 'Không dịch').props.accessibilityState).toEqual({ selected: true });
    expect(radio(r, 'Tiếng Anh').props.accessibilityState).toEqual({ selected: false });
    expect(texts(r)).not.toContain(TRANSLATION_ON_DEVICE_NOTE);
  });

  it('offers Tiếng Việt, not itself, when recording in English', () => {
    const { r } = render({ language: 'en-US' });
    expect(texts(r)).toContain('Tiếng Việt');
    expect(texts(r)).not.toContain('Tiếng Anh');
  });

  it('choosing a language reports it and the on-device note appears once it is on', () => {
    const { r, onChange } = render();
    act(() => radio(r, 'Tiếng Anh').props.onPress());
    expect(onChange).toHaveBeenCalledWith('en-US');
    act(() => r.update(<TranslationSection language="vi-VN" onChange={onChange} translateTo="en-US" />));
    expect(texts(r)).toContain(TRANSLATION_ON_DEVICE_NOTE);
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

describe('TranslationSection language packs (Phase 21)', () => {
  const buttonLabels = (r: TestRenderer.ReactTestRenderer) =>
    r.root.findAll((n) => n.props.accessibilityRole === 'button' && typeof n.props.onPress === 'function').map((n) => n.findAllByType(Text)[0]?.props.children);
  const press = (r: TestRenderer.ReactTestRenderer, label: string) =>
    act(() => r.root.findAll((n) => n.props.accessibilityRole === 'button' && typeof n.props.onPress === 'function' && n.findAllByType(Text)[0]?.props.children === label)[0].props.onPress());
  const withPacks = (status: 'checking' | 'missing' | 'downloading' | 'ready' | 'unavailable' | 'error' | 'off', error: string | null = null) => {
    const download = jest.fn();
    return { download, ...render({ translateTo: 'en-US', packs: { status, error, download } }) };
  };

  it('shows nothing about packs while translation is off', () => {
    const { r } = render({ packs: { status: 'off', error: null, download: jest.fn() } });
    expect(r.root.findAllByProps({ testID: 'translation-packs' })).toHaveLength(0);
  });

  it('missing packs: says so (with the Wi-Fi advice) and offers "Tải gói dịch ~30 MB", which downloads', () => {
    const { r, download } = withPacks('missing');
    expect(texts(r)).toContain(PACK_MISSING_NOTE);
    expect(buttonLabels(r)).toContain(PACK_DOWNLOAD_LABEL);
    press(r, PACK_DOWNLOAD_LABEL);
    expect(download).toHaveBeenCalledTimes(1);
  });

  it('downloading and checking: progress, no download button', () => {
    for (const status of ['downloading', 'checking'] as const) {
      const { r } = withPacks(status);
      expect(r.root.findAllByProps({ testID: 'translation-packs' }).length).toBeGreaterThan(0);
      expect(buttonLabels(r)).not.toContain(PACK_DOWNLOAD_LABEL);
    }
  });

  it('error: shows the message and "Thử lại" runs the download again', () => {
    const { r, download } = withPacks('error', 'Không tải được gói dịch.');
    expect(texts(r)).toContain('Không tải được gói dịch.');
    press(r, 'Thử lại');
    expect(download).toHaveBeenCalledTimes(1);
  });

  it('ready and unavailable say so, with no buttons', () => {
    expect(texts(withPacks('ready').r)).toContain('Gói dịch đã sẵn sàng.');
    const unavailable = withPacks('unavailable');
    expect(texts(unavailable.r)).toContain(PACK_UNAVAILABLE_NOTE);
    expect(buttonLabels(unavailable.r)).toEqual([]);
  });
});
