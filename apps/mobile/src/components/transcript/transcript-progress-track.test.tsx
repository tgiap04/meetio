import TestRenderer, { act } from 'react-test-renderer';
import { TranscriptProgressTrack } from './transcript-progress-track';

function render(position: number) {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<TranscriptProgressTrack position={position} />);
  });
  return renderer;
}

describe('TranscriptProgressTrack', () => {
  it('renders the knob at the given position', () => {
    const renderer = render(0.08);
    const knob = renderer.root.findByProps({ testID: 'transcript-progress-knob' });
    const style = [knob.props.style].flat();
    expect(style).toContainEqual({ left: '8%' });
  });

  it('clamps a position above 1 to the end of the track', () => {
    const renderer = render(1.5);
    const knob = renderer.root.findByProps({ testID: 'transcript-progress-knob' });
    const style = [knob.props.style].flat();
    expect(style).toContainEqual({ left: '100%' });
  });

  it('clamps a negative position to the start of the track', () => {
    const renderer = render(-0.5);
    const knob = renderer.root.findByProps({ testID: 'transcript-progress-knob' });
    const style = [knob.props.style].flat();
    expect(style).toContainEqual({ left: '0%' });
  });
});
