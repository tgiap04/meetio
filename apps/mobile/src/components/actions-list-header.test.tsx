import TestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { ActionsListHeader, type ActionsListHeaderProps } from './actions-list-header';

function render(props: Partial<ActionsListHeaderProps> = {}) {
  const handlers = {
    onBack: jest.fn(),
    onIncludeDoneChange: jest.fn(),
    onAssigneeChange: jest.fn(),
    onMeetingChange: jest.fn(),
  };
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <ActionsListHeader
        activeAssigneeKey="all"
        activeMeetingKey="all"
        assigneeChips={[{ key: 'all', label: 'Tất cả' }, { key: 'e1', label: 'Bình' }]}
        includeDone={false}
        meetingChips={[{ key: 'all', label: 'Tất cả' }, { key: 'm1', label: 'Sprint Review' }]}
        {...handlers}
        {...props}
      />,
    );
  });
  return { renderer, ...handlers };
}

describe('ActionsListHeader', () => {
  it('renders the title and both filter chip rows', () => {
    const { renderer } = render();
    const texts = renderer.root.findAllByType(Text).map((node) => node.props.children).flat().join('');
    expect(texts).toContain('Việc cần làm');
    expect(texts).toContain('Bình');
    expect(texts).toContain('Sprint Review');
  });

  it('calls onIncludeDoneChange when the toggle flips', () => {
    const { renderer, onIncludeDoneChange } = render();
    const toggle = renderer.root.findByProps({ value: false });
    act(() => toggle.props.onValueChange(true));
    expect(onIncludeDoneChange).toHaveBeenCalledWith(true);
  });

  it('hides the meeting chip row when there is only "Tất cả"', () => {
    const { renderer } = render({ meetingChips: [{ key: 'all', label: 'Tất cả' }] });
    const texts = renderer.root.findAllByType(Text).map((node) => node.props.children).flat();
    expect(texts.filter((text) => text === 'Tất cả')).toHaveLength(1);
  });
});
