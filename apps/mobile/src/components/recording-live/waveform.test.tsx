import TestRenderer, { act } from 'react-test-renderer';
import { Waveform, BAR_HEIGHT_RATIOS } from './waveform';

function renderWaveform() {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<Waveform testID="waveform" />);
  });
  return renderer;
}

describe('Waveform', () => {
  it('renders exactly one bar per fixed height ratio', () => {
    const renderer = renderWaveform();
    for (let index = 0; index < BAR_HEIGHT_RATIOS.length; index += 1) {
      expect(renderer.root.findByProps({ testID: `waveform-bar-${index}` })).toBeTruthy();
    }
    expect(() => renderer.root.findByProps({ testID: `waveform-bar-${BAR_HEIGHT_RATIOS.length}` })).toThrow();
  });

  it('is deterministic across renders (no randomness)', () => {
    const first = renderWaveform();
    const second = renderWaveform();
    const heightsOf = (renderer: TestRenderer.ReactTestRenderer) =>
      BAR_HEIGHT_RATIOS.map((_, index) => {
        const bar = renderer.root.findByProps({ testID: `waveform-bar-${index}` });
        const style = bar.props.style as { height: number }[];
        return style[1]?.height;
      });
    expect(heightsOf(first)).toEqual(heightsOf(second));
  });
});
