import { normalizeEntityName } from './name-normalizer.js';

describe('normalizeEntityName', () => {
  it('brings the forms of one person to a single key', () => {
    const forms = ['Anh Bình', 'anh bình', 'Bình', 'ANH  BÌNH', 'anh Bình,'];
    expect(new Set(forms.map((f) => normalizeEntityName(f, 'person')))).toEqual(new Set(['binh']));
  });

  it('drops stacked honorifics but keeps a name that is itself an honorific word', () => {
    expect(normalizeEntityName('sếp anh Tuấn', 'person')).toBe('tuan');
    expect(normalizeEntityName('Anh', 'person')).toBe('anh');
    expect(normalizeEntityName('Nguyễn Văn Anh', 'person')).toBe('nguyen van anh');
  });

  it('keeps honorific-looking words for non-person entities', () => {
    expect(normalizeEntityName('Bà Nà Hills', 'organization')).toBe('ba na hills');
  });

  it('folds đ and punctuation', () => {
    expect(normalizeEntityName('Dự án Đông-Á (v2)', 'project')).toBe('du an dong a v2');
  });
});
