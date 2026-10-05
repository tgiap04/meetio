import TestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { ViewModeSwitch } from './view-mode-switch';

const mounted: TestRenderer.ReactTestRenderer[] = [];
afterEach(() => act(() => mounted.splice(0).forEach((r) => r.unmount())));

const tabs = (r: TestRenderer.ReactTestRenderer) => r.root.findAll((n) => n.props.accessibilityRole === 'tab' && typeof n.props.onPress === 'function');

describe('ViewModeSwitch', () => {
  it('offers Gốc / Dịch / Song song with the current one selected', () => {
    let r!: TestRenderer.ReactTestRenderer;
    act(() => {
      r = TestRenderer.create(<ViewModeSwitch onChange={jest.fn()} value="translated" />);
    });
    mounted.push(r);
    expect(r.root.findAllByType(Text).map((t) => t.props.children)).toEqual(['Gốc', 'Dịch', 'Song song']);
    expect(tabs(r).map((t) => t.props.accessibilityState.selected)).toEqual([false, true, false]);
  });

  it('reports the mode that was tapped', () => {
    const onChange = jest.fn();
    let r!: TestRenderer.ReactTestRenderer;
    act(() => {
      r = TestRenderer.create(<ViewModeSwitch onChange={onChange} value="both" />);
    });
    mounted.push(r);
    act(() => tabs(r)[0].props.onPress());
    act(() => tabs(r)[1].props.onPress());
    expect(onChange.mock.calls).toEqual([['original'], ['translated']]);
  });
});
