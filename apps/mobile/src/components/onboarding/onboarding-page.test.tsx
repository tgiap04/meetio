import TestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { OnboardingPage } from './onboarding-page';

const PAGE = {
  key: 'sample',
  title: 'Dòng một\nDòng hai',
  body: 'Mô tả có nhắc tới Meetio ở giữa câu.',
};

function renderPage() {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<OnboardingPage page={PAGE} width={320} />);
  });
  return renderer;
}

describe('OnboardingPage', () => {
  it('renders the title text', () => {
    const renderer = renderPage();
    const texts = renderer.root.findAllByType(Text).map((node) => node.props.children);
    expect(texts.flat().join('')).toContain('Dòng một');
    expect(texts.flat().join('')).toContain('Dòng hai');
  });

  it('renders the body paragraph including the brand name', () => {
    const renderer = renderPage();
    const texts = renderer.root.findAllByType(Text).map((node) => node.props.children);
    const flattened = texts.flat().join('');
    expect(flattened).toContain('Meetio');
    expect(flattened).toContain('Mô tả có nhắc tới');
  });
});
