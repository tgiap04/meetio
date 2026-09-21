import TestRenderer, { act } from 'react-test-renderer';
import { Switch, Text } from 'react-native';
import { TranslationToggleSection } from './translation-toggle-section';

describe('TranslationToggleSection', () => {
  it('renders the heading and target label', () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <TranslationToggleSection enabled onToggle={jest.fn()} targetLabel="Dịch sang Tiếng Anh" />,
      );
    });
    const texts = renderer.root
      .findAllByType(Text)
      .map((n) => n.props.children)
      .filter((c): c is string => typeof c === 'string' && c.length > 0);
    expect(texts).toEqual(['Dịch thuật', 'Dịch sang Tiếng Anh']);
  });

  it('reflects the enabled value on the switch', () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <TranslationToggleSection enabled={false} onToggle={jest.fn()} targetLabel="Dịch sang Tiếng Anh" />,
      );
    });
    expect(renderer.root.findByType(Switch).props.value).toBe(false);
  });

  it('calls onToggle when the switch changes', () => {
    const onToggle = jest.fn();
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <TranslationToggleSection enabled onToggle={onToggle} targetLabel="Dịch sang Tiếng Anh" />,
      );
    });
    act(() => {
      renderer.root.findByType(Switch).props.onValueChange(false);
    });
    expect(onToggle).toHaveBeenCalledWith(false);
  });

  it('dims the target row when disabled', () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <TranslationToggleSection enabled={false} onToggle={jest.fn()} targetLabel="Dịch sang Tiếng Anh" />,
      );
    });
    const dimmedNode = renderer.root.findAll(
      (node) => Array.isArray(node.props.style) && node.props.style.some((s: unknown) => (s as { opacity?: number })?.opacity === 0.4),
    );
    expect(dimmedNode.length).toBeGreaterThan(0);
  });
});
