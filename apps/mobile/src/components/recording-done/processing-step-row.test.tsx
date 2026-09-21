import TestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { ProcessingStepRow } from './processing-step-row';
import { StatusBadge } from '../ui/status-badge';
import { AppIcon } from '../icons/app-icon';

// react-native's Pressable is `React.memo(Pressable)`; react-test-renderer
// flattens the memo wrapper, so `findByType(Pressable)` never matches — the
// row always sets `disabled` explicitly (true when inert, false when it has
// a real destination), so that prop is what locates it.
function findRow(renderer: TestRenderer.ReactTestRenderer, disabled: boolean) {
  return renderer.root.findByProps({ disabled });
}

// `@expo/vector-icons`'s Feather wrapper re-passes `name` to an inner glyph
// primitive, so a bare `findAllByProps({ name })` double-counts. Scoping to
// the `AppIcon` facade (P01) itself gives one match per icon actually drawn.
function iconsNamed(renderer: TestRenderer.ReactTestRenderer, name: string) {
  return renderer.root.findAllByType(AppIcon).filter((node) => node.props.name === name);
}

function render(props: Parameters<typeof ProcessingStepRow>[0]) {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<ProcessingStepRow {...props} />);
  });
  return renderer;
}

describe('ProcessingStepRow', () => {
  it('"done" state shows the green check icon and plain "Hoàn thành" text, no badge, no chevron', () => {
    const renderer = render({ label: 'Transcript', state: 'done' });
    const texts = renderer.root.findAllByType(Text).map((node) => node.props.children);
    expect(texts.flat()).toContain('Hoàn thành');
    expect(renderer.root.findAllByType(StatusBadge)).toHaveLength(0);
    expect(iconsNamed(renderer, 'chevronRight')).toHaveLength(0);
    expect(iconsNamed(renderer, 'check')).toHaveLength(1);
  });

  it('"active" state shows the processing badge and a chevron when onPress is given', () => {
    const onPress = jest.fn();
    const renderer = render({ label: 'Knowledge Graph', onPress, state: 'active' });
    const badge = renderer.root.findByType(StatusBadge);
    expect(badge.props.status).toBe('processing');
    expect(iconsNamed(renderer, 'chevronRight')).toHaveLength(1);
    expect(iconsNamed(renderer, 'sparkle')).toHaveLength(1);
  });

  it('"pending" state shows the outline clock icon and plain "Chờ xử lý" text, no badge, no chevron', () => {
    const renderer = render({ label: 'Tóm tắt & Action Items', state: 'pending' });
    const texts = renderer.root.findAllByType(Text).map((node) => node.props.children);
    expect(texts.flat()).toContain('Chờ xử lý');
    expect(renderer.root.findAllByType(StatusBadge)).toHaveLength(0);
    expect(iconsNamed(renderer, 'chevronRight')).toHaveLength(0);
    expect(iconsNamed(renderer, 'clock')).toHaveLength(1);
  });

  it('calls onPress only when the row is interactive', () => {
    const onPress = jest.fn();
    const renderer = render({ label: 'Knowledge Graph', onPress, state: 'active' });
    act(() => {
      findRow(renderer, false).props.onPress();
    });
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('is disabled and inert when no onPress is supplied', () => {
    const renderer = render({ label: 'Transcript', state: 'done' });
    const row = findRow(renderer, true);
    expect(row.props.accessibilityState).toEqual({ disabled: true });
    expect(row.props.accessibilityRole).toBeUndefined();
  });

  it('draws the bottom divider only when showDivider is set', () => {
    const withDivider = render({ label: 'Transcript', showDivider: true, state: 'done' });
    const withoutDivider = render({ label: 'Tóm tắt & Action Items', state: 'pending' });

    const withDividerStyle = findRow(withDivider, true).props.style as unknown[];
    const withoutDividerStyle = findRow(withoutDivider, true).props.style as unknown[];

    expect(withDividerStyle[1]).toBeTruthy();
    expect(withoutDividerStyle[1]).toBe(false);
  });

  it("renders exactly one badge and one chevron across the design's four real rows", () => {
    const rows = [
      render({ label: 'Transcript', showDivider: true, state: 'done' }),
      render({ label: 'Embedding', showDivider: true, state: 'done' }),
      render({ label: 'Knowledge Graph', onPress: jest.fn(), showDivider: true, state: 'active' }),
      render({ label: 'Tóm tắt & Action Items', state: 'pending' }),
    ];
    const badgeCount = rows.reduce((sum, r) => sum + r.root.findAllByType(StatusBadge).length, 0);
    const chevronCount = rows.reduce((sum, r) => sum + iconsNamed(r, 'chevronRight').length, 0);
    expect(badgeCount).toBe(1);
    expect(chevronCount).toBe(1);
  });
});
