import TestRenderer, { act } from 'react-test-renderer';
import { Pressable, Text } from 'react-native';
import { RelationList } from './relation-list';
import { GRAPH_NODES, GRAPH_RELATIONS } from '../../mocks';
import { colors } from '../../theme/colors';

function render() {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<RelationList nodes={GRAPH_NODES} relations={GRAPH_RELATIONS} />);
  });
  return renderer;
}

function flattenStyle(style: unknown): Record<string, unknown> {
  if (Array.isArray(style)) {
    return Object.assign({}, ...style.map(flattenStyle));
  }
  return (style as Record<string, unknown>) ?? {};
}

function findText(renderer: TestRenderer.ReactTestRenderer, text: string) {
  return renderer.root.findAll((node) => node.type === Text && node.props.children === text)[0];
}

describe('RelationList', () => {
  it('always renders all three relation rows, subject through object', () => {
    const renderer = render();
    const verbTexts = renderer.root
      .findAllByType(Text)
      .map((node) => (typeof node.props.children === 'string' ? node.props.children : ''))
      .join(' ');
    for (const relation of GRAPH_RELATIONS) {
      expect(verbTexts).toContain(relation.verb);
    }
    expect(findText(renderer, 'Nguyễn Văn Anh')).toBeDefined();
    expect(findText(renderer, 'API')).toBeDefined();
    expect(findText(renderer, 'Dự án ABC')).toBeDefined();
    expect(findText(renderer, 'Lê Thị Mai')).toBeDefined();
    expect(findText(renderer, 'Authentication')).toBeDefined();
  });

  it('renders each entity name in its node palette colour', () => {
    const renderer = render();
    const subjectText = findText(renderer, 'Nguyễn Văn Anh');
    expect(flattenStyle(subjectText.props.style).color).toBe(colors.entityBlueText);
  });

  it('falls back to the raw id when a relation references an unknown node', () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <RelationList
          nodes={GRAPH_NODES}
          relations={[{ id: 'r', subjectId: 'ghost-node', verb: 'liên quan', objectId: 'api' }]}
        />,
      );
    });
    expect(findText(renderer, 'ghost-node')).toBeDefined();
  });

  it('renders "Xem chi tiết" as inert — no onPress handler, not a Pressable', () => {
    const renderer = render();
    const link = findText(renderer, 'Xem chi tiết');
    expect(link.props.onPress).toBeUndefined();
    expect(renderer.root.findAllByType(Pressable)).toHaveLength(0);
  });
});
