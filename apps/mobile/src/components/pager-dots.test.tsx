import TestRenderer, { act } from 'react-test-renderer';
import { PagerDots } from './pager-dots';

function widthOf(renderer: TestRenderer.ReactTestRenderer, testID: string): number {
  const node = renderer.root.findByProps({ testID });
  const style = Array.isArray(node.props.style) ? node.props.style : [node.props.style];
  const merged = Object.assign({}, ...style);
  return merged.width;
}

describe('PagerDots', () => {
  it('renders one dot per count', () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<PagerDots count={3} activeIndex={0} testID="pager" />);
    });
    expect(renderer.root.findByProps({ testID: 'pager-dot-0' })).toBeTruthy();
    expect(renderer.root.findByProps({ testID: 'pager-dot-1' })).toBeTruthy();
    expect(renderer.root.findByProps({ testID: 'pager-dot-2' })).toBeTruthy();
  });

  it('renders the active dot as a wider pill than the two inactive dots, which match each other', () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<PagerDots count={3} activeIndex={1} testID="pager" />);
    });

    const activeWidth = widthOf(renderer, 'pager-dot-1');
    const inactiveWidth0 = widthOf(renderer, 'pager-dot-0');
    const inactiveWidth2 = widthOf(renderer, 'pager-dot-2');

    expect(activeWidth).toBeGreaterThan(inactiveWidth0);
    expect(inactiveWidth0).toBe(inactiveWidth2);
  });

  it('moves the active pill when activeIndex changes', () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<PagerDots count={3} activeIndex={0} testID="pager" />);
    });
    expect(widthOf(renderer, 'pager-dot-0')).toBeGreaterThan(widthOf(renderer, 'pager-dot-2'));

    act(() => {
      renderer.update(<PagerDots count={3} activeIndex={2} testID="pager" />);
    });
    expect(widthOf(renderer, 'pager-dot-2')).toBeGreaterThan(widthOf(renderer, 'pager-dot-0'));
  });
});
