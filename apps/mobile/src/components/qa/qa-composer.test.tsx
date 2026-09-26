import type { ComponentProps } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { QaComposer } from './qa-composer';

describe('QaComposer', () => {
  let renderer: TestRenderer.ReactTestRenderer | undefined;
  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  function render(props: Partial<ComponentProps<typeof QaComposer>> = {}) {
    const onSend = props.onSend ?? jest.fn();
    act(() => {
      renderer = TestRenderer.create(<QaComposer onSend={onSend} placeholder="Hỏi…" {...props} />);
    });
    return { onSend };
  }

  it('sends the trimmed question and clears the field', () => {
    const { onSend } = render();
    act(() => {
      renderer!.root.findByProps({ testID: 'qa-composer-input' }).props.onChangeText('  Ai phụ trách API?  ');
    });
    act(() => {
      renderer!.root.findByProps({ testID: 'qa-composer-send' }).props.onPress();
    });
    expect(onSend).toHaveBeenCalledWith('Ai phụ trách API?');
    expect(renderer!.root.findByProps({ testID: 'qa-composer-input' }).props.value).toBe('');
  });

  it('disables the send button for a blank question', () => {
    const { onSend } = render();
    act(() => {
      renderer!.root.findByProps({ testID: 'qa-composer-send' }).props.onPress();
    });
    expect(onSend).not.toHaveBeenCalled();
    expect(renderer!.root.findByProps({ testID: 'qa-composer-send' }).props.disabled).toBe(true);
  });

  it('disables the field entirely while sending', () => {
    render({ sending: true });
    expect(renderer!.root.findByProps({ testID: 'qa-composer-input' }).props.editable).toBe(false);
  });

  it('disables the field entirely when the thread is blocked (e.g. MEETING_NOT_READY)', () => {
    render({ disabled: true });
    expect(renderer!.root.findByProps({ testID: 'qa-composer-input' }).props.editable).toBe(false);
    expect(renderer!.root.findByProps({ testID: 'qa-composer-send' }).props.disabled).toBe(true);
  });

  it('disables sending past the 1000-character limit', () => {
    const { onSend } = render();
    act(() => {
      renderer!.root.findByProps({ testID: 'qa-composer-input' }).props.onChangeText('a'.repeat(1001));
    });
    act(() => {
      renderer!.root.findByProps({ testID: 'qa-composer-send' }).props.onPress();
    });
    expect(onSend).not.toHaveBeenCalled();
  });
});
