import TestRenderer, { act } from 'react-test-renderer';
import { Text, TextInput } from 'react-native';
import { LibraryFiltersHeader } from './library-filters-header';

function baseProps() {
  return {
    queryText: '',
    onQueryTextChange: jest.fn(),
    searchPlaceholder: 'Tìm...',
    statusFilterKey: 'all',
    statusFilters: [{ key: 'all', label: 'Tất cả' }],
    onStatusFilterChange: jest.fn(),
    onFilterPress: jest.fn(),
    dateRangeLabel: null as string | null,
    onClearDateRange: jest.fn(),
    pendingDeleteId: null as string | null,
    onUndoDelete: jest.fn(),
  };
}

function render(props: ReturnType<typeof baseProps>) {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<LibraryFiltersHeader {...props} />);
  });
  return renderer;
}

describe('LibraryFiltersHeader', () => {
  it('calls onFilterPress when the funnel button is tapped', () => {
    const props = baseProps();
    const renderer = render(props);
    act(() => {
      renderer.root.findByProps({ accessibilityLabel: 'Bộ lọc' }).props.onPress();
    });
    expect(props.onFilterPress).toHaveBeenCalledTimes(1);
  });

  it('forwards search text changes', () => {
    const props = baseProps();
    const renderer = render(props);
    act(() => {
      renderer.root.findByType(TextInput).props.onChangeText('standup');
    });
    expect(props.onQueryTextChange).toHaveBeenCalledWith('standup');
  });

  it('renders no date chip and no undo banner by default', () => {
    const renderer = render(baseProps());
    expect(() => renderer.root.findByProps({ testID: 'library-date-filter-chip' })).toThrow();
    expect(() => renderer.root.findByProps({ testID: 'delete-undo-banner' })).toThrow();
  });

  it('renders the date chip and clears it on tap', () => {
    const props = { ...baseProps(), dateRangeLabel: 'Từ 01/09 – 25/09' };
    const renderer = render(props);
    const chip = renderer.root.findByProps({ testID: 'library-date-filter-chip' });
    const texts = chip.findAllByType(Text).map((n) => n.props.children);
    expect(texts).toContain('Từ 01/09 – 25/09 ×');
    act(() => chip.props.onPress());
    expect(props.onClearDateRange).toHaveBeenCalledTimes(1);
  });

  it('renders the undo banner and fires onUndoDelete', () => {
    const props = { ...baseProps(), pendingDeleteId: 'm1' };
    const renderer = render(props);
    const banner = renderer.root.findByProps({ testID: 'delete-undo-banner' });
    act(() => {
      banner.findByProps({ accessibilityRole: 'button' }).props.onPress();
    });
    expect(props.onUndoDelete).toHaveBeenCalledTimes(1);
  });
});
