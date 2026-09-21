import TestRenderer, { act } from 'react-test-renderer';
import { TextInput } from 'react-native';
import { TranscriptScreen } from './transcript-screen';
import { TRANSCRIPT_LINES } from '../../mocks/transcript.mock';

function render(onBack: () => void = jest.fn()) {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<TranscriptScreen onBack={onBack} />);
  });
  return renderer;
}

function typeQuery(renderer: TestRenderer.ReactTestRenderer, query: string) {
  const input = renderer.root.findByType(TextInput);
  act(() => {
    input.props.onChangeText(query);
  });
}

describe('TranscriptScreen', () => {
  it('renders all four transcript entries with nothing typed', () => {
    const renderer = render();
    for (const line of TRANSCRIPT_LINES) {
      expect(renderer.root.findAllByProps({ children: line.text }).length).toBeGreaterThan(0);
    }
  });

  it('narrows to the lines containing "JWT" (case-insensitive)', () => {
    const renderer = render();
    typeQuery(renderer, 'JWT');

    const matching = TRANSCRIPT_LINES.filter((line) => line.text.includes('JWT'));
    expect(matching).toHaveLength(2);
    for (const line of matching) {
      expect(renderer.root.findAllByProps({ children: line.text }).length).toBeGreaterThan(0);
    }
    const nonMatching = TRANSCRIPT_LINES.filter((line) => !line.text.includes('JWT'));
    for (const line of nonMatching) {
      expect(renderer.root.findAllByProps({ children: line.text })).toHaveLength(0);
    }
  });

  it('renders EmptyState for a query matching nothing', () => {
    const renderer = render();
    typeQuery(renderer, 'zzz-no-match-zzz');
    expect(renderer.root.findByProps({ testID: 'empty-state' })).toBeTruthy();
  });

  it('matches a diacritic-bearing query against the line content', () => {
    const renderer = render();
    const target = TRANSCRIPT_LINES.find((line) => line.text.includes('backend'));
    expect(target).toBeDefined();
    typeQuery(renderer, 'backend');

    expect(renderer.root.findAllByProps({ children: target!.text }).length).toBeGreaterThan(0);
    for (const other of TRANSCRIPT_LINES.filter((line) => !line.text.includes('backend'))) {
      expect(renderer.root.findAllByProps({ children: other.text })).toHaveLength(0);
    }
  });

  it('never renders a speaker name', () => {
    const renderer = render();
    for (const name of ['Nguyễn Văn Anh', 'Lê Thị Mai', 'Trần Minh Quân']) {
      expect(renderer.root.findAllByProps({ children: name })).toHaveLength(0);
    }
  });

  it('calls onBack when the header back chevron is pressed', () => {
    const onBack = jest.fn();
    const renderer = render(onBack);
    const backButton = renderer.root.findByProps({ accessibilityLabel: 'Quay lại' });

    act(() => {
      backButton.props.onPress();
    });

    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('renders the edit icon as inert — no onPress handler wired', () => {
    const renderer = render();
    const editIcon = renderer.root.findByProps({ testID: 'transcript-edit-icon' });
    expect(editIcon.props.onPress).toBeUndefined();
  });
});
