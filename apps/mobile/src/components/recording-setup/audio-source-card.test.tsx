import TestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import type { RecordingOption } from '../../content/recording-options';
import { AudioSourceCard } from './audio-source-card';

describe('AudioSourceCard', () => {
  const options: readonly RecordingOption<string>[] = [
    { id: 'device-mic', label: 'Micro trên máy', description: 'Sử dụng micro của điện thoại' },
    { id: 'bluetooth-headset', label: 'Tai nghe Bluetooth', description: 'Kết nối qua tai nghe Bluetooth' },
  ];

  function render(props: Partial<Parameters<typeof AudioSourceCard>[0]> = {}) {
    const onSelect = jest.fn();
    const merged = {
      options,
      selectedId: 'device-mic' as const,
      onSelect,
      ...props,
    };

    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<AudioSourceCard {...merged} />);
    });

    return { renderer, onSelect };
  }

  function findRadios(renderer: TestRenderer.ReactTestRenderer) {
    return renderer.root.findAll(
      (node) => node.props?.accessibilityRole === 'radio' && typeof node.props?.onPress === 'function',
    );
  }

  describe('rendering', () => {
    it('renders one radio row per option', () => {
      const { renderer } = render();
      const radios = findRadios(renderer);
      expect(radios).toHaveLength(2);
    });

    it('marks the selected option as selected', () => {
      const { renderer } = render({ selectedId: 'device-mic' });
      const radios = findRadios(renderer);
      expect(radios[0].props.accessibilityState.selected).toBe(true);
      expect(radios[1].props.accessibilityState.selected).toBe(false);
    });

    it('marks a different option when selectedId changes', () => {
      const { renderer } = render({ selectedId: 'bluetooth-headset' });
      const radios = findRadios(renderer);
      expect(radios[0].props.accessibilityState.selected).toBe(false);
      expect(radios[1].props.accessibilityState.selected).toBe(true);
    });

    it('renders dividers between options', () => {
      const { renderer } = render();
      const dividers = renderer.root.findAll((node) => {
        const style = node.props?.style;
        return Array.isArray(style) && style.some((s) => s?.backgroundColor);
      });
      expect(dividers.length).toBeGreaterThan(0);
    });

    it('displays labels and descriptions for each option', () => {
      const { renderer } = render();
      const texts = renderer.root.findAllByType(Text).map((n) => n.props.children);
      const textString = texts.join(' ');
      expect(textString).toContain('Micro trên máy');
      expect(textString).toContain('Tai nghe Bluetooth');
    });
  });

  describe('selection', () => {
    it('calls onSelect with the option id when a radio is pressed', () => {
      const { renderer, onSelect } = render({ selectedId: 'device-mic' });
      const radios = findRadios(renderer);

      act(() => {
        radios[1].props.onPress();
      });

      expect(onSelect).toHaveBeenCalledWith('bluetooth-headset');
    });

    it('calls onSelect with the current option if tapped again', () => {
      const { renderer, onSelect } = render({ selectedId: 'device-mic' });
      const radios = findRadios(renderer);

      act(() => {
        radios[0].props.onPress();
      });

      expect(onSelect).toHaveBeenCalledWith('device-mic');
    });

    it('handles multiple selections in sequence', () => {
      const { renderer, onSelect } = render({ selectedId: 'device-mic' });
      const radios = findRadios(renderer);

      act(() => {
        radios[1].props.onPress();
      });
      expect(onSelect).toHaveBeenCalledWith('bluetooth-headset');

      act(() => {
        radios[0].props.onPress();
      });
      expect(onSelect).toHaveBeenCalledWith('device-mic');

      expect(onSelect).toHaveBeenCalledTimes(2);
    });
  });

  describe('empty and single option', () => {
    it('renders correctly with a single option', () => {
      const { renderer } = render({ options: [options[0]] });
      const radios = findRadios(renderer);
      expect(radios).toHaveLength(1);
    });

    it('renders correctly with many options', () => {
      const manyOptions: readonly RecordingOption<string>[] = [
        { id: 'opt1', label: 'Option 1', description: 'Desc 1' },
        { id: 'opt2', label: 'Option 2', description: 'Desc 2' },
        { id: 'opt3', label: 'Option 3', description: 'Desc 3' },
        { id: 'opt4', label: 'Option 4', description: 'Desc 4' },
      ];
      const { renderer } = render({ options: manyOptions });
      const radios = findRadios(renderer);
      expect(radios).toHaveLength(4);
    });
  });

  describe('null selection', () => {
    it('handles selectedId as null (no option selected)', () => {
      const { renderer } = render({ selectedId: null });
      const radios = findRadios(renderer);
      expect(radios.every((r) => !r.props.accessibilityState.selected)).toBe(true);
    });

    it('allows selecting an option from null state', () => {
      const { renderer, onSelect } = render({ selectedId: null });
      const radios = findRadios(renderer);

      act(() => {
        radios[0].props.onPress();
      });

      expect(onSelect).toHaveBeenCalledWith('device-mic');
    });
  });

  describe('accessibility', () => {
    it('sets radio accessibility role', () => {
      const { renderer } = render();
      const radios = findRadios(renderer);
      expect(radios.every((r) => r.props.accessibilityRole === 'radio')).toBe(true);
    });

    it('sets selected state in accessibility state', () => {
      const { renderer } = render({ selectedId: 'device-mic' });
      const radios = findRadios(renderer);
      expect(radios[0].props.accessibilityState).toHaveProperty('selected');
    });
  });
});
