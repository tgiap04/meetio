import TestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { SearchResultRow } from './search-result-row';
import type { SearchDocumentItem, SearchMeetingItem, SearchPersonItem } from '../../mocks/types';

const MEETING_ITEM: SearchMeetingItem = {
  kind: 'meeting',
  id: 'sprint-review',
  title: 'Sprint Review',
  durationMinutes: 42,
  date: '12/05/2025',
  status: 'done',
  snippet: '...authentication và API...',
};

const DOCUMENT_ITEM: SearchDocumentItem = {
  kind: 'document',
  id: 'api-documentation',
  title: 'API Documentation',
  status: 'processing',
  relatedTo: 'Dự án ABC - API',
};

const PERSON_ITEM: SearchPersonItem = {
  kind: 'person',
  id: 'nguyen-van-anh',
  name: 'Nguyễn Văn Anh',
  initials: 'NA',
  meetingCount: 2,
};

function render(item: SearchMeetingItem | SearchDocumentItem | SearchPersonItem, onPress = jest.fn()) {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<SearchResultRow item={item} onPress={onPress} />);
  });
  return { renderer, onPress };
}

function findButton(renderer: TestRenderer.ReactTestRenderer) {
  return renderer.root.findByProps({ accessibilityRole: 'button' });
}

describe('SearchResultRow', () => {
  it('renders a meeting row with duration, date, and snippet, and pushes its id on press', () => {
    const { renderer, onPress } = render(MEETING_ITEM);
    const texts = renderer.root.findAllByType(Text).map((node) => node.props.children);
    expect(texts).toContainEqual('Sprint Review');
    expect(texts.flat().join('')).toContain('42 phút');
    expect(texts.flat().join('')).toContain('...authentication và API...');
    act(() => {
      findButton(renderer).props.onPress();
    });
    expect(onPress).toHaveBeenCalledWith('sprint-review');
  });

  it('renders a document row with the "Liên quan:" line and pushes its id on press', () => {
    const { renderer, onPress } = render(DOCUMENT_ITEM);
    const texts = renderer.root.findAllByType(Text).map((node) => node.props.children);
    expect(texts).toContainEqual('API Documentation');
    expect(texts.flat().join('')).toContain('Liên quan: Dự án ABC - API');
    act(() => {
      findButton(renderer).props.onPress();
    });
    expect(onPress).toHaveBeenCalledWith('api-documentation');
  });

  it('renders a person row with meeting count and never calls onPress', () => {
    const { renderer, onPress } = render(PERSON_ITEM);
    const texts = renderer.root.findAllByType(Text).map((node) => node.props.children);
    expect(texts).toContainEqual('Nguyễn Văn Anh');
    expect(texts.flat().join('')).toContain('Xuất hiện trong 2 cuộc họp');
    act(() => {
      findButton(renderer).props.onPress?.();
    });
    expect(onPress).not.toHaveBeenCalled();
  });
});
