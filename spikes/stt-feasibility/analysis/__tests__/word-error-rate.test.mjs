import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wordErrorRate } from '../word-error-rate.mjs';
import { normalizeText, toWords } from '../normalize-vietnamese-text.mjs';

test('khớp hoàn toàn cho WER 0', () => {
  assert.equal(wordErrorRate(['xin', 'chào'], ['xin', 'chào']).wer, 0);
});

test('tách đúng thay thế, xoá, chèn', () => {
  // Căn chỉnh tối ưu duy nhất: "hai" bị mất (D), bốn → bốm (S), "sáu" thừa (I) = 3 lỗi;
  // mọi cách căn khác tốn ít nhất 4.
  const r = wordErrorRate(toWords('một hai ba bốn năm'), toWords('một ba bốm năm sáu'));
  assert.deepEqual(
    { S: r.substitutions, D: r.deletions, I: r.insertions, N: r.referenceWords },
    { S: 1, D: 1, I: 1, N: 5 },
  );
  assert.equal(r.wer, 3 / 5);
});

test('hoà điểm được tính là thay thế, không phải xoá + chèn', () => {
  const r = wordErrorRate(['má'], ['mà']);
  assert.deepEqual([r.substitutions, r.deletions, r.insertions], [1, 0, 0]);
});

test('bản nhận diện rỗng là xoá toàn bộ', () => {
  const r = wordErrorRate(['một', 'hai', 'ba'], []);
  assert.deepEqual([r.deletions, r.wer], [3, 1]);
});

test('bản chép tay rỗng: 0 nếu cũng không nhận ra gì, vô cực nếu có chữ chèn', () => {
  assert.equal(wordErrorRate([], []).wer, 0);
  assert.equal(wordErrorRate([], ['ồn']).wer, Infinity);
});

test('chuẩn hoá giữ dấu tiếng Việt, bỏ dấu câu và hoa thường', () => {
  assert.equal(
    normalizeText('  Chào anh, Hùng!  Deadline là thứ Sáu. '),
    'chào anh hùng deadline là thứ sáu',
  );
  // "má" viết dạng tổ hợp (NFD) phải bằng dạng dựng sẵn (NFC)
  assert.deepEqual(toWords('má'), toWords('má'));
  assert.notDeepEqual(toWords('ma'), toWords('má'));
});

test('chạy được cỡ một cuộc họp dài trong thời gian chấp nhận được', () => {
  const vocabulary = [
    'chúng',
    'ta',
    'sẽ',
    'triển',
    'khai',
    'tính',
    'năng',
    'mới',
    'vào',
    'tuần',
    'sau',
  ];
  const reference = Array.from({ length: 4000 }, (_, i) => vocabulary[i % vocabulary.length]);
  const hypothesis = reference.filter((_, i) => i % 17 !== 0);
  const started = Date.now();
  const r = wordErrorRate(reference, hypothesis);
  assert.ok(Date.now() - started < 5000, 'quá chậm cho 4.000 × ~3.800 từ');
  assert.ok(r.wer > 0 && r.wer < 0.1);
});
