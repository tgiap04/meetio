import TestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import type { EntityMergeRecord } from '@meetio/shared';
import { EntityMergesSection } from './entity-merges-section';

const MERGE: EntityMergeRecord = {
  id: 'merge-1',
  merged_entity_id: 'e2',
  merged_name: 'Anh Nguyễn',
  merged_at: '2026-01-01T00:00:00.000Z',
  undo_until: '2026-01-31T00:00:00.000Z',
};

function render(merges: readonly EntityMergeRecord[], onUndoPress = jest.fn(), undoingIds = new Set<string>()) {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <EntityMergesSection merges={merges} onUndoPress={onUndoPress} undoingIds={undoingIds} />,
    );
  });
  return renderer;
}

describe('EntityMergesSection', () => {
  it('renders nothing for an empty list', () => {
    const renderer = render([]);
    expect(renderer.toJSON()).toBeNull();
  });

  it('renders the merged name and an undo button', () => {
    const renderer = render([MERGE]);
    const texts = renderer.root.findAllByType(Text).map((t) => t.props.children).flat();
    expect(texts).toContain('Anh Nguyễn');
    expect(texts).toContain('Hoàn tác');
  });

  it('tapping undo calls onUndoPress with that merge record', () => {
    const onUndoPress = jest.fn();
    const renderer = render([MERGE], onUndoPress);
    act(() => {
      renderer.root.findByProps({ accessibilityRole: 'button' }).props.onPress();
    });
    expect(onUndoPress).toHaveBeenCalledWith(MERGE);
  });

  it('disables the undo button while that merge is undoing', () => {
    const renderer = render([MERGE], jest.fn(), new Set(['merge-1']));
    expect(renderer.root.findByProps({ accessibilityRole: 'button' }).props.disabled).toBe(true);
  });
});
