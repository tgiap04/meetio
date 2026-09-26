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
    expect(normalizeEntityName('Đông-Á (v2)', 'project')).toBe('dong a v2');
  });

  it('drops the leading category word the model sometimes keeps', () => {
    expect(normalizeEntityName('công ty Sao Mai', 'organization')).toBe(normalizeEntityName('Sao Mai', 'organization'));
    expect(normalizeEntityName('ngân hàng Vietcombank', 'organization')).toBe('vietcombank');
    expect(normalizeEntityName('Khách hàng Sao Mai', 'organization')).toBe('sao mai');
    expect(normalizeEntityName('ứng dụng Meetio', 'product')).toBe('meetio');
    expect(normalizeEntityName('Dự án ABC', 'project')).toBe('abc');
    expect(normalizeEntityName('Dự án', 'project')).toBe('du an'); // nothing left after it: keep
    expect(normalizeEntityName('Công ty Sao Mai', 'person')).toBe('cong ty sao mai'); // only for its own type
  });
});
