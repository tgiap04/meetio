import TestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { TranslatedSegment, type TranslatedSegmentProps } from './translated-segment';

const mounted: TestRenderer.ReactTestRenderer[] = [];
afterEach(() => act(() => mounted.splice(0).forEach((r) => r.unmount())));

function render(props: TranslatedSegmentProps) {
  let r!: TestRenderer.ReactTestRenderer;
  act(() => {
    r = TestRenderer.create(<TranslatedSegment {...props} />);
  });
  mounted.push(r);
  return r;
}
/** Elements that are buttons (the composite and its host node both carry the props — take the outermost). */
const buttons = (r: TestRenderer.ReactTestRenderer) => r.root.findAll((n) => n.props.accessibilityRole === 'button' && typeof n.props.onPress === 'function');
const texts = (r: TestRenderer.ReactTestRenderer) => r.root.findAllByType(Text).map((n) => n.props.children);

describe('TranslatedSegment', () => {
  it('shows the translation in its own style', () => {
    const r = render({ text: 'Hello everyone' });
    expect(texts(r)).toEqual(['Hello everyone']);
    expect(r.root.findByProps({ testID: 'translated-segment' })).toBeTruthy();
    expect(buttons(r)).toHaveLength(0);
  });

  it('shows nothing while a translation is simply not there yet', () => {
    expect(render({ text: null }).toJSON()).toBeNull();
  });

  it('a failed translation says so and offers "Thử lại", which calls back', () => {
    const onRetry = jest.fn();
    const r = render({ text: null, failed: true, onRetry });
    expect(texts(r)).toEqual(expect.arrayContaining(['Chưa dịch được', 'Thử lại']));
    expect(buttons(r).length).toBeGreaterThan(0);
    act(() => buttons(r)[0].props.onPress());
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('while retrying it shows progress and cannot be tapped again', () => {
    const onRetry = jest.fn();
    const r = render({ text: null, failed: true, retrying: true, onRetry });
    expect(texts(r)).toContain('Đang dịch…');
    expect(buttons(r)).toHaveLength(0);
  });

  it('prefers the translation over a stale failure flag', () => {
    const r = render({ text: 'Done', failed: true, onRetry: jest.fn() });
    expect(texts(r)).toEqual(['Done']);
  });

  it('can show a retry error without hiding the button', () => {
    const r = render({ text: null, failed: true, onRetry: jest.fn(), error: 'Dịch vụ tạm thời không dùng được' });
    expect(texts(r)).toEqual(expect.arrayContaining(['Dịch vụ tạm thời không dùng được', 'Thử lại']));
  });
});

describe('TranslatedSegment, a line that was never translated (transcript)', () => {
  it('says there is no translation and offers "Dịch", which calls back', () => {
    const onRetry = jest.fn();
    const r = render({ text: null, failed: true, variant: 'missing', onRetry });
    expect(texts(r)).toEqual(expect.arrayContaining(['Chưa có bản dịch', 'Dịch']));
    expect(texts(r)).not.toContain('Thử lại');
    act(() => buttons(r)[0].props.onPress());
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
