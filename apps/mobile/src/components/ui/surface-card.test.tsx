import TestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { SurfaceCard } from './surface-card';

describe('SurfaceCard', () => {
  it('renders its children', () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <SurfaceCard>
          <Text>nội dung</Text>
        </SurfaceCard>,
      );
    });
    expect(renderer.root.findByType(Text).props.children).toBe('nội dung');
  });

  it('merges a caller-provided style onto the card', () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <SurfaceCard style={{ marginTop: 20 }} testID="card">
          <Text>x</Text>
        </SurfaceCard>,
      );
    });
    const card = renderer.root.findByProps({ testID: 'card' });
    const flatStyle = [card.props.style].flat();
    expect(flatStyle).toContainEqual({ marginTop: 20 });
  });
});
