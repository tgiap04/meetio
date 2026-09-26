import TestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { useInfiniteEntitiesQuery } from '../../hooks/use-entities-query';
import { AssigneePickerSheet } from './assignee-picker-sheet';

jest.mock('../../hooks/use-entities-query', () => ({
  useInfiniteEntitiesQuery: jest.fn(),
}));

const mockedUseInfiniteEntitiesQuery = useInfiniteEntitiesQuery as jest.Mock;

function mockPeople(people: Array<{ id: string; canonical_name: string }>, isPending = false) {
  mockedUseInfiniteEntitiesQuery.mockReturnValue({
    data: { pages: [{ items: people, next_offset: null }] },
    isPending,
  });
}

function render(visible = true, onSelect = jest.fn(), onClose = jest.fn()) {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<AssigneePickerSheet onClose={onClose} onSelect={onSelect} visible={visible} />);
  });
  return { renderer, onSelect, onClose };
}

describe('AssigneePickerSheet', () => {
  beforeEach(() => jest.clearAllMocks());

  it('queries only person entities', () => {
    mockPeople([]);
    render(true);
    expect(mockedUseInfiniteEntitiesQuery).toHaveBeenCalledWith(expect.objectContaining({ type: 'person' }), true);
  });

  it('calls onSelect(null, null) when "Không ai" is tapped', () => {
    mockPeople([]);
    const { renderer, onSelect, onClose } = render(true);
    act(() => {
      renderer.root.findByProps({ testID: 'assignee-picker-none' }).props.onPress();
    });
    expect(onSelect).toHaveBeenCalledWith(null, null);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onSelect with the tapped person's id and name", () => {
    mockPeople([{ id: 'e1', canonical_name: 'Bình' }]);
    const { renderer, onSelect } = render(true);
    const row = renderer.root
      .findAllByProps({ accessibilityRole: 'button' })
      .find((node) => node.findAllByType(Text).some((textNode) => textNode.props.children === 'Bình'));
    expect(row).toBeTruthy();
    act(() => row?.props.onPress());
    expect(onSelect).toHaveBeenCalledWith('e1', 'Bình');
  });

  it('disables the query when not visible', () => {
    mockPeople([]);
    render(false);
    expect(mockedUseInfiniteEntitiesQuery).toHaveBeenCalledWith(expect.objectContaining({ type: 'person' }), false);
  });

  it('shows the loading state while pending', () => {
    mockPeople([], true);
    const { renderer } = render(true);
    expect(renderer.root.findByProps({ testID: 'loading-state' })).toBeTruthy();
  });
});
