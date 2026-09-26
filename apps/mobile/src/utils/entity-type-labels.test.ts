import {
  ENTITY_TYPE_CHIPS,
  entityChipToTypeQuery,
  entityTypeLabel,
  entityTypeToChipKey,
} from './entity-type-labels';

describe('entityTypeToChipKey', () => {
  it('maps person/project/topic to themselves', () => {
    expect(entityTypeToChipKey('person')).toBe('person');
    expect(entityTypeToChipKey('project')).toBe('project');
    expect(entityTypeToChipKey('topic')).toBe('topic');
  });

  it('folds organization, product and other into "other"', () => {
    expect(entityTypeToChipKey('organization')).toBe('other');
    expect(entityTypeToChipKey('product')).toBe('other');
    expect(entityTypeToChipKey('other')).toBe('other');
  });
});

describe('entityChipToTypeQuery', () => {
  it('omits the param for "all"', () => {
    expect(entityChipToTypeQuery('all')).toBeUndefined();
  });

  it('sends a single value for person/project/topic', () => {
    expect(entityChipToTypeQuery('person')).toBe('person');
    expect(entityChipToTypeQuery('project')).toBe('project');
    expect(entityChipToTypeQuery('topic')).toBe('topic');
  });

  it('sends the three folded types as a comma list for "other"', () => {
    expect(entityChipToTypeQuery('other')).toBe('organization,product,other');
  });
});

describe('entityTypeLabel', () => {
  it('has a Vietnamese label for every chip-bearing type', () => {
    expect(entityTypeLabel('person')).toBe('Người');
    expect(entityTypeLabel('project')).toBe('Dự án');
    expect(entityTypeLabel('organization')).toBe('Tổ chức');
    expect(entityTypeLabel('topic')).toBe('Chủ đề');
    expect(entityTypeLabel('product')).toBe('Sản phẩm');
    expect(entityTypeLabel('other')).toBe('Khác');
  });
});

describe('ENTITY_TYPE_CHIPS', () => {
  it('has exactly the five decided chips, in order', () => {
    expect(ENTITY_TYPE_CHIPS.map((c) => c.key)).toEqual(['all', 'person', 'project', 'topic', 'other']);
    expect(ENTITY_TYPE_CHIPS.map((c) => c.label)).toEqual(['Tất cả', 'Người', 'Dự án', 'Chủ đề', 'Khác']);
  });
});
