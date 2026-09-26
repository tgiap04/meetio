import TestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { SettingsUsageSection } from './settings-usage-section';

function render(usage: Parameters<typeof SettingsUsageSection>[0]['usage']) {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<SettingsUsageSection usage={usage} />);
  });
  return renderer;
}

describe('SettingsUsageSection (NFR-07)', () => {
  it('shows the plain used-token count when there is no budget', () => {
    const renderer = render({ used: 4200, budget: null, percent: null, warning: false });
    const texts = renderer.root.findAllByType(Text).map((node) => node.props.children);
    expect(texts).toContain('Đã dùng 4200 token tháng này');
  });

  it('shows used / budget and percent when a budget is set', () => {
    const renderer = render({ used: 4000, budget: 10000, percent: 40, warning: false });
    const texts = renderer.root.findAllByType(Text).map((node) => node.props.children);
    expect(texts).toContain('Đã dùng 4000 / 10000 token (40%)');
  });

  it('shows no warning text below 80%', () => {
    const renderer = render({ used: 4000, budget: 10000, percent: 40, warning: false });
    const texts = renderer.root.findAllByType(Text).map((node) => node.props.children).flat().join(' ');
    expect(texts).not.toContain('gần hết hạn mức');
  });

  it('shows a visible warning at or above 80%', () => {
    const renderer = render({ used: 8500, budget: 10000, percent: 85, warning: true });
    const texts = renderer.root.findAllByType(Text).map((node) => node.props.children).flat().join(' ');
    expect(texts).toContain('gần hết hạn mức');
  });

  it('never shows the warning when there is no budget, even if the server sent it', () => {
    const renderer = render({ used: 4200, budget: null, percent: null, warning: false });
    const texts = renderer.root.findAllByType(Text).map((node) => node.props.children).flat().join(' ');
    expect(texts).not.toContain('gần hết hạn mức');
  });
});
