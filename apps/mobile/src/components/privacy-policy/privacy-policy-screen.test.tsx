import TestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';

// Exposed for the same reason `consent-screen.test.tsx` mocks it — see that
// file's doc comment.
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  router: { back: (...args: unknown[]) => mockBack(...args) },
}));

import PrivacyPolicyScreen from '../../../app/(app)/privacy-policy';
import { PRIVACY_POLICY_CONTENT, flattenPrivacyPolicyContent } from '../../content/privacy-policy';

function render() {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<PrivacyPolicyScreen />);
  });
  return renderer;
}

describe('PrivacyPolicyScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the title and the version caption', () => {
    const renderer = render();
    const texts = renderer.root.findAllByType(Text).map((node) => node.props.children).flat();
    expect(texts).toContain('Chính sách quyền riêng tư');
    expect(texts.join(' ')).toContain('Phiên bản đồng ý');
  });

  it('renders every section heading from PRIVACY_POLICY_CONTENT', () => {
    const renderer = render();
    const texts = renderer.root.findAllByType(Text).map((node) => node.props.children).flat();
    const headings = PRIVACY_POLICY_CONTENT.filter((block) => block.type === 'heading');
    for (const heading of headings) {
      expect(texts).toContain(heading.text);
    }
  });

  it('renders content whose flattened text matches the flattened source content 1:1', () => {
    const renderer = render();
    const rendered = renderer.root.findAllByType(Text).map((node) => node.props.children).flat().join(' ');
    // Sanity slice — the full doc drift check lives in privacy-policy.test.ts.
    const expectedFragment = flattenPrivacyPolicyContent(PRIVACY_POLICY_CONTENT).slice(0, 40);
    expect(rendered.replace(/\s+/g, ' ')).toContain(expectedFragment.slice(0, 20));
  });

  it('back button calls router.back()', () => {
    const renderer = render();
    const backButton = renderer.root.findByProps({ accessibilityLabel: 'Quay lại' });
    act(() => {
      backButton.props.onPress();
    });
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});
