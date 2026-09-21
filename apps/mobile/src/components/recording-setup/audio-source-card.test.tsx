import TestRenderer, { act } from 'react-test-renderer';
import { AudioSourceCard } from './audio-source-card';
import { AUDIO_SOURCE_OPTIONS } from '../../mocks/recording-options.mock';

function findRadios(renderer: TestRenderer.ReactTestRenderer) {
  return renderer.root.findAll((node) => node.props.accessibilityRole === 'radio' && typeof node.props.onPress === 'function');
}

describe('AudioSourceCard', () => {
  it('renders one radio row per option, selecting the given id', () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <AudioSourceCard onSelect={jest.fn()} options={AUDIO_SOURCE_OPTIONS} selectedId="device-microphone" />,
      );
    });
    const radios = findRadios(renderer);
    expect(radios).toHaveLength(2);
    expect(radios[0].props.accessibilityState.selected).toBe(true);
    expect(radios[1].props.accessibilityState.selected).toBe(false);
  });

  it('calls onSelect with the tapped option id', () => {
    const onSelect = jest.fn();
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <AudioSourceCard onSelect={onSelect} options={AUDIO_SOURCE_OPTIONS} selectedId="device-microphone" />,
      );
    });
    act(() => {
      findRadios(renderer)[1].props.onPress();
    });
    expect(onSelect).toHaveBeenCalledWith('external-device');
  });
});
