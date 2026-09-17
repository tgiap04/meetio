import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { PermissionBody } from './permission-body';
import { isRenderableVietnameseText } from '../../theme/typography';

const STRINGS = [
  'Cần quyền truy cập\nMicrophone',
  'Meetio cần quyền truy cập microphone để có thể ghi âm và nhận diện giọng nói.',
  'Cho phép',
  'Mở Cài đặt',
  'Bạn đã từ chối quyền microphone. Mở Cài đặt hệ thống để bật lại trước khi ghi âm.',
  'Không, để sau',
];

function render(props: Partial<React.ComponentProps<typeof PermissionBody>> = {}) {
  const onPrimaryPress = jest.fn();
  const onDefer = jest.fn();
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <PermissionBody
        view="ask"
        isBusy={false}
        onPrimaryPress={onPrimaryPress}
        onDefer={onDefer}
        {...props}
      />,
    );
  });
  return { renderer, onPrimaryPress, onDefer };
}

describe('PermissionBody', () => {
  it('shows the "ask" primary label and no blocked explanation', () => {
    const { renderer } = render({ view: 'ask' });

    const primary = renderer.root.findByProps({ testID: 'permission-primary-button' });
    expect(primary.props.label).toBe('Cho phép');
    expect(renderer.root.findAllByProps({ testID: 'permission-blocked-explain' })).toHaveLength(0);
  });

  it('shows the "blocked" primary label plus the explanation line', () => {
    const { renderer } = render({ view: 'blocked' });

    const primary = renderer.root.findByProps({ testID: 'permission-primary-button' });
    expect(primary.props.label).toBe('Mở Cài đặt');
    expect(renderer.root.findByProps({ testID: 'permission-blocked-explain' })).toBeDefined();
  });

  it('always renders the "Không, để sau" defer link, for both views', () => {
    for (const view of ['ask', 'blocked'] as const) {
      const { renderer, onDefer } = render({ view });
      const link = renderer.root.findByProps({ testID: 'permission-defer-link' });

      act(() => {
        link.props.onPress();
      });

      expect(onDefer).toHaveBeenCalledTimes(1);
    }
  });

  it('forwards a primary press to onPrimaryPress', () => {
    const { renderer, onPrimaryPress } = render({ view: 'ask' });
    const primary = renderer.root.findByProps({ testID: 'permission-primary-button' });

    act(() => {
      primary.props.onPress();
    });

    expect(onPrimaryPress).toHaveBeenCalledTimes(1);
  });

  it('passes isBusy through to the primary button as loading', () => {
    const { renderer } = render({ view: 'ask', isBusy: true });
    const primary = renderer.root.findByProps({ testID: 'permission-primary-button' });

    expect(primary.props.loading).toBe(true);
  });

  it('renders every Vietnamese string with system-font-renderable characters', () => {
    for (const text of STRINGS) {
      expect(isRenderableVietnameseText(text)).toBe(true);
    }
  });
});
