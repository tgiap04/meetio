import TestRenderer, { act } from 'react-test-renderer';
import { Switch, Text } from 'react-native';
import { ExportSheet } from './export-sheet';

function render(props: Partial<Parameters<typeof ExportSheet>[0]> = {}) {
  const merged = {
    visible: true,
    onClose: jest.fn(),
    onExport: jest.fn(),
    exporting: false,
    ...props,
  };
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<ExportSheet {...merged} />);
  });
  return { renderer, ...merged };
}

function findButtonByLabel(renderer: TestRenderer.ReactTestRenderer, label: string) {
  return renderer.root
    .findAll((node) => node.props.accessibilityRole === 'button' && typeof node.props.onPress === 'function')
    .find((node) => node.findAllByType(Text).some((t) => t.props.children === label));
}

describe('ExportSheet', () => {
  it('starts with every section selected', () => {
    const { renderer } = render();
    const switches = renderer.root.findAllByType(Switch);
    expect(switches).toHaveLength(4);
    switches.forEach((s) => expect(s.props.value).toBe(true));
  });

  it('exports with only the sections still selected after unchecking one', () => {
    const onExport = jest.fn();
    const { renderer } = render({ onExport });
    act(() => {
      renderer.root.findAllByType(Switch)[3].props.onValueChange(false); // translation
    });
    act(() => {
      findButtonByLabel(renderer, 'Xuất Markdown')?.props.onPress();
    });
    expect(onExport).toHaveBeenCalledWith('markdown', ['summary', 'actions', 'transcript']);
  });

  it('calls onExport with pdf format', () => {
    const onExport = jest.fn();
    const { renderer } = render({ onExport });
    act(() => {
      findButtonByLabel(renderer, 'Xuất PDF')?.props.onPress();
    });
    expect(onExport).toHaveBeenCalledWith('pdf', ['summary', 'actions', 'transcript', 'translation']);
  });

  it('disables both export buttons once every section is unchecked', () => {
    const { renderer } = render();
    act(() => {
      renderer.root.findAllByType(Switch).forEach((s) => s.props.onValueChange(false));
    });
    expect(findButtonByLabel(renderer, 'Xuất Markdown')?.props.accessibilityState.disabled).toBe(true);
  });

  it('calls onClose when Hủy is tapped', () => {
    const onClose = jest.fn();
    const { renderer } = render({ onClose });
    act(() => {
      findButtonByLabel(renderer, 'Hủy')?.props.onPress();
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
