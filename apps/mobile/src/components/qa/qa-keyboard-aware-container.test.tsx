import TestRenderer, { act } from 'react-test-renderer';
import { Dimensions, Keyboard, Platform, StyleSheet, Text } from 'react-native';
import { QaKeyboardAwareContainer } from './qa-keyboard-aware-container';

const mockInsets = { top: 0, bottom: 24, left: 0, right: 0 };
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => mockInsets,
}));

type Listener = (event: { endCoordinates: { height: number; screenY: number } }) => void;

describe('QaKeyboardAwareContainer', () => {
  const listeners = new Map<string, Listener>();
  const originalOS = Platform.OS;
  const originalVersion = Platform.Version;
  function setVersion(version: number) {
    Object.defineProperty(Platform, 'Version', { value: version, configurable: true });
  }
  let renderer: TestRenderer.ReactTestRenderer | undefined;

  beforeEach(() => {
    listeners.clear();
    jest.spyOn(Keyboard, 'addListener').mockImplementation(((name: string, cb: Listener) => {
      listeners.set(name, cb);
      return { remove: jest.fn() };
    }) as unknown as typeof Keyboard.addListener);
  });

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
    Platform.OS = originalOS;
    setVersion(originalVersion as number);
    jest.restoreAllMocks();
  });

  function paddingBottom() {
    const view = renderer!.root.findByProps({ testID: 'qa-keyboard-aware-container' });
    return StyleSheet.flatten(view.props.style).paddingBottom;
  }

  function mount() {
    act(() => {
      renderer = TestRenderer.create(
        <QaKeyboardAwareContainer>
          <Text>composer</Text>
        </QaKeyboardAwareContainer>,
      );
    });
  }

  it('on Android API 35 pads by the keyboard height (not the inset) while shown, inset when hidden', () => {
    Platform.OS = 'android';
    setVersion(35);
    mount();
    expect(paddingBottom()).toBe(24);
    act(() => listeners.get('keyboardDidShow')!({ endCoordinates: { height: 300, screenY: 0 } }));
    expect(paddingBottom()).toBe(300);
    act(() => listeners.get('keyboardDidHide')!({ endCoordinates: { height: 0, screenY: 0 } }));
    expect(paddingBottom()).toBe(24);
    expect(renderer!.root.findAllByType(Text)[0]?.props.children).toBe('composer');
  });

  it('on Android API 34 relies on window resize: no listeners, inset only', () => {
    Platform.OS = 'android';
    setVersion(34);
    mount();
    expect(listeners.size).toBe(0);
    expect(paddingBottom()).toBe(24);
  });

  it('on iOS follows keyboardWillChangeFrame measured from the window bottom', () => {
    Platform.OS = 'ios';
    jest.spyOn(Dimensions, 'get').mockReturnValue({ width: 390, height: 800, scale: 3, fontScale: 1 });
    mount();
    act(() => listeners.get('keyboardWillChangeFrame')!({ endCoordinates: { height: 336, screenY: 464 } }));
    expect(paddingBottom()).toBe(336);
    act(() => listeners.get('keyboardWillChangeFrame')!({ endCoordinates: { height: 336, screenY: 800 } }));
    expect(paddingBottom()).toBe(24);
    act(() => listeners.get('keyboardWillHide')!({ endCoordinates: { height: 0, screenY: 800 } }));
    expect(paddingBottom()).toBe(24);
  });

  it('removes its listeners on unmount', () => {
    Platform.OS = 'android';
    setVersion(35);
    const remove = jest.fn();
    (Keyboard.addListener as jest.Mock).mockImplementation((name: string, cb: Listener) => {
      listeners.set(name, cb);
      return { remove };
    });
    mount();
    act(() => renderer!.unmount());
    renderer = undefined;
    expect(remove).toHaveBeenCalledTimes(2);
  });
});
