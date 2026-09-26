import TestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import type { QaFilters } from '@meetio/shared';
import { QaFilterChips } from './qa-filter-chips';

function filters(overrides: Partial<QaFilters> = {}): QaFilters {
  return { from: null, to: null, entity_id: null, entity_name: null, ...overrides };
}

describe('QaFilterChips', () => {
  let renderer: TestRenderer.ReactTestRenderer | undefined;
  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  it('renders nothing for a question with no filters', () => {
    act(() => {
      renderer = TestRenderer.create(<QaFilterChips filters={filters()} />);
    });
    expect(renderer!.toJSON()).toBeNull();
  });

  it('renders a date-range chip', () => {
    act(() => {
      renderer = TestRenderer.create(
        <QaFilterChips filters={filters({ from: '2026-05-01T00:00:00.000Z', to: '2026-05-10T00:00:00.000Z' })} />,
      );
    });
    const texts = renderer!.root.findAllByType(Text).map((node) => node.props.children);
    expect(texts).toContain('01/05 – 10/05');
  });

  it('renders the entity name chip', () => {
    act(() => {
      renderer = TestRenderer.create(<QaFilterChips filters={filters({ entity_name: 'Bình' })} />);
    });
    const texts = renderer!.root.findAllByType(Text).map((node) => node.props.children);
    expect(texts).toContain('Bình');
  });
});
