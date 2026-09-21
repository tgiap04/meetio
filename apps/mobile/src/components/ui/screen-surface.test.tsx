import TestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenSurface } from './screen-surface';

function render(element: React.ReactElement) {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(element);
  });
  return renderer;
}

describe('ScreenSurface', () => {
  it('insets the top edge by default — that is the status bar / Dynamic Island', () => {
    const renderer = render(
      <ScreenSurface>
        <Text>nội dung</Text>
      </ScreenSurface>,
    );
    expect(renderer.root.findByType(SafeAreaView).props.edges).toEqual(['top']);
  });

  it('passes through explicit edges', () => {
    const renderer = render(
      <ScreenSurface edges={['top', 'bottom']}>
        <Text>nội dung</Text>
      </ScreenSurface>,
    );
    expect(renderer.root.findByType(SafeAreaView).props.edges).toEqual(['top', 'bottom']);
  });

  it('renders its children', () => {
    const renderer = render(
      <ScreenSurface>
        <Text>nội dung</Text>
      </ScreenSurface>,
    );
    expect(renderer.root.findByType(Text).props.children).toBe('nội dung');
  });

  it('lets a caller override the background, for screens with a full-bleed backdrop behind them', () => {
    const renderer = render(
      <ScreenSurface style={{ backgroundColor: 'transparent' }}>
        <Text>nội dung</Text>
      </ScreenSurface>,
    );
    const style = renderer.root.findByType(SafeAreaView).props.style;
    expect(style[style.length - 1]).toEqual({ backgroundColor: 'transparent' });
  });
});
