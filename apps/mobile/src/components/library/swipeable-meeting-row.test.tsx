import type { ReactNode } from 'react';
import { Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';

/**
 * Fake `ReanimatedSwipeable`: the real one needs the Reanimated/worklets native runtime, which Jest
 * does not have. The fake renders the row plus the right-hand action and exposes the imperative
 * `close()` plus the open/close callbacks so the tests can drive them directly.
 */
const mockClose = jest.fn();
let mockSwipeableProps: Record<string, unknown>[] = [];
jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { forwardRef, useImperativeHandle } = require('react');
  return {
    __esModule: true,
    default: forwardRef(function MockSwipeable(
      props: { children: ReactNode; renderRightActions: () => ReactNode },
      ref: unknown,
    ) {
      mockSwipeableProps.push(props as unknown as Record<string, unknown>);
      useImperativeHandle(ref, () => ({ close: mockClose }));
      return (
        <>
          {props.children}
          {props.renderRightActions()}
        </>
      );
    }),
  };
});

import { SwipeableMeetingRow } from './swipeable-meeting-row';
import type { SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';

function render(
  onDelete: () => void,
  openRowRef: { current: SwipeableMethods | null } = { current: null },
  onLongPress?: () => void,
  onRename: () => void = jest.fn(),
) {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <SwipeableMeetingRow
        onDeleteRequest={onDelete}
        onRenameRequest={onRename}
        openRowRef={openRowRef}
        row={{ leading: 'waveform', title: 'Sprint Review', meta: 'meta', onLongPress }}
      />,
    );
  });
  return renderer;
}

describe('SwipeableMeetingRow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSwipeableProps = [];
  });

  it('renders the row and a red "Xóa" action with an accessibility label', () => {
    const renderer = render(jest.fn());
    expect(renderer.root.findAllByType(Text).map((n) => n.props.children)).toEqual(
      expect.arrayContaining(['Sprint Review', 'Đổi tên', 'Xóa']),
    );
    const action = renderer.root.findByProps({ accessibilityLabel: 'Xóa cuộc họp Sprint Review' });
    expect(action.props.accessibilityRole).toBe('button');
  });

  it('tapping the action closes the row and requests deletion', () => {
    const onDelete = jest.fn();
    const renderer = render(onDelete);
    act(() => renderer.root.findByProps({ accessibilityLabel: 'Xóa cuộc họp Sprint Review' }).props.onPress());
    expect(mockClose).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('tapping "Đổi tên" closes the row and requests rename, not delete', () => {
    const onDelete = jest.fn();
    const onRename = jest.fn();
    const renderer = render(onDelete, undefined, undefined, onRename);
    const action = renderer.root.findByProps({ accessibilityLabel: 'Đổi tên cuộc họp Sprint Review' });
    expect(action.props.accessibilityRole).toBe('button');
    act(() => action.props.onPress());
    expect(mockClose).toHaveBeenCalledTimes(1);
    expect(onRename).toHaveBeenCalledTimes(1);
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('keeps the long-press handler on the row', () => {
    const onLongPress = jest.fn();
    const renderer = render(jest.fn(), undefined, onLongPress);
    const row = renderer.root.findAll(
      (n) => n.props.accessibilityRole === 'button' && typeof n.props.onLongPress === 'function',
    )[0];
    act(() => row.props.onLongPress());
    expect(onLongPress).toHaveBeenCalledTimes(1);
  });

  it('closes the previously open row when another one opens, and tracks the new one', () => {
    const previous = { close: jest.fn() } as unknown as SwipeableMethods;
    const openRowRef = { current: previous as SwipeableMethods | null };
    render(jest.fn(), openRowRef);
    act(() => (mockSwipeableProps[0].onSwipeableWillOpen as () => void)());
    expect(previous.close).toHaveBeenCalledTimes(1);
    expect(openRowRef.current).not.toBe(previous);
    expect(openRowRef.current).toBeTruthy();
  });

  it('clears the open-row slot when the open row closes', () => {
    const openRowRef = { current: null as SwipeableMethods | null };
    render(jest.fn(), openRowRef);
    act(() => (mockSwipeableProps[0].onSwipeableWillOpen as () => void)());
    act(() => (mockSwipeableProps[0].onSwipeableClose as () => void)());
    expect(openRowRef.current).toBeNull();
  });
});
