import { SeamFilter } from './stt-seam-filter.js';

describe('SeamFilter', () => {
  const tail = 'chúng ta bắt đầu cuộc họp hôm nay'.split(' ');

  it('is a no-op until a seam begins', () => {
    const f = new SeamFilter();
    expect(f.filterFinal('xin chào')).toBe('xin chào');
  });

  it('strips the part of a first final that repeats the tail already emitted', () => {
    const f = new SeamFilter();
    f.begin(tail);
    expect(f.filterFinal('cuộc họp hôm nay có ba nội dung')).toBe('có ba nội dung');
    // The seam is over: later finals pass untouched, even if they repeat words.
    expect(f.filterFinal('hôm nay hôm nay')).toBe('hôm nay hôm nay');
  });

  it('matches case- and punctuation-insensitively and keeps the new text as spoken', () => {
    const f = new SeamFilter();
    f.begin(tail);
    expect(f.filterFinal('Hôm nay, chúng ta bàn về Gemini.')).toBe('chúng ta bàn về Gemini.');
  });

  it('drops a final that lies wholly inside the tail and keeps matching the following ones', () => {
    const f = new SeamFilter();
    f.begin('a b c d e f'.split(' '));
    expect(f.filterFinal('c d')).toBe('');
    expect(f.filterFinal('e f g')).toBe('g');
    expect(f.filterFinal('f')).toBe('f');
  });

  it('ends the seam at the first final that does not overlap', () => {
    const f = new SeamFilter();
    f.begin(tail);
    expect(f.filterFinal('một câu hoàn toàn mới')).toBe('một câu hoàn toàn mới');
    expect(f.filterFinal('hôm nay')).toBe('hôm nay');
  });

  it('does not treat one coincidental word as a repeat', () => {
    const f = new SeamFilter();
    f.begin(tail);
    expect(f.filterFinal('nay trời đẹp')).toBe('nay trời đẹp');
  });

  it('filters partials the same way without ending the seam', () => {
    const f = new SeamFilter();
    f.begin(tail);
    expect(f.filterPartial('cuộc họp hôm nay')).toBe('');
    expect(f.filterPartial('cuộc họp hôm nay có')).toBe('có');
    expect(f.filterFinal('cuộc họp hôm nay có ba')).toBe('có ba');
  });

  it('remembers the last words emitted as the next tail', () => {
    const f = new SeamFilter();
    f.noteEmitted('một hai ba');
    f.noteEmitted('bốn năm');
    expect(f.tailWords(3)).toEqual(['ba', 'bốn', 'năm']);
  });
});
